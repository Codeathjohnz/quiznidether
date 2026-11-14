<?php
const TERMINATION_REASONS = [
    'fullscreen_exit' => 'Exited full-screen mode (pressed Esc / F11 or left full screen)',
    'tab_hidden'      => 'Switched to another tab, opened a new tab, or minimized the browser',
    'window_blur'     => 'Switched to another window or application (e.g. Alt+Tab, clicked outside the browser)',
    'page_unload'     => 'Closed the quiz tab/window (clicked X) or reloaded the page',
    'reopened'        => 'Left the quiz and opened the quiz link again while the attempt was still running',
    'no_heartbeat'    => 'Connection lost or browser was force-closed (device stopped responding)',
    'second_screen'   => 'Connected a second monitor / extended display during the quiz',
    'window_resized'  => 'Made the quiz window smaller than the screen (split screen / snapped window)',
];

function now(): string
{
    return date('Y-m-d H:i:s');
}

function reason_text(?string $code): string
{
    if (!$code) return '';
    return TERMINATION_REASONS[$code] ?? $code;
}

function random_code(int $len = 10): string
{
    $chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    $s = '';
    for ($i = 0; $i < $len; $i++) $s .= $chars[random_int(0, strlen($chars) - 1)];
    return $s;
}

function unique_link_code(PDO $db): string
{
    $st = $db->prepare('SELECT 1 FROM quizzes WHERE link_code = ?');
    do {
        $code = random_code(10);
        $st->execute([$code]);
    } while ($st->fetch());
    return $code;
}

function passing_percent(array $quiz): float
{
    return ($quiz['passing_mode'] ?? 'auto') === 'manual'
        ? (float)$quiz['passing_score']
        : (float)AUTO_PASSING_PERCENT;
}

function fmt_num($v): string
{
    $s = number_format((float)$v, 2, '.', '');
    return rtrim(rtrim($s, '0'), '.');
}

const TIME_UNITS = ['seconds' => 1, 'minutes' => 60, 'hours' => 3600];

/** Human-readable timer, e.g. "1 hr 30 min", "45 min", "90 sec" -> "1 min 30 sec". */
function fmt_timer(int $s): string
{
    $h = intdiv($s, 3600);
    $m = intdiv($s % 3600, 60);
    $sec = $s % 60;
    $p = [];
    if ($h) $p[] = $h . ($h > 1 ? ' hrs' : ' hr');
    if ($m) $p[] = $m . ' min';
    if ($sec) $p[] = $sec . ' sec';
    return $p ? implode(' ', $p) : '0 sec';
}

/** Seconds allowed for network delay when a per-question timer runs out. */
const PER_QUESTION_GRACE = 5;

/** Expected length of a quiz: the whole-quiz timer, or the sum of every question's time. */
function quiz_total_seconds(PDO $db, array $quiz): int
{
    if (($quiz['timer_mode'] ?? 'whole') !== 'per_question') return (int)$quiz['time_seconds'];
    $st = $db->prepare('SELECT COALESCE(SUM(COALESCE(time_seconds, ?)), 0) FROM questions WHERE quiz_id = ?');
    $st->execute([(int)$quiz['time_seconds'], $quiz['id']]);
    return (int)$st->fetchColumn();
}

function fmt_duration(int $secs): string
{
    if ($secs < 0) $secs = 0;
    return intdiv($secs, 60) . 'm ' . str_pad((string)($secs % 60), 2, '0', STR_PAD_LEFT) . 's';
}

/** URL path of the app root, e.g. "/xampp/Quiz%20ni%20Dether" */
function app_base_path(): string
{
    static $base = null;
    if ($base !== null) return $base;
    $app = str_replace('\\', '/', realpath(__DIR__ . '/..'));
    $file = str_replace('\\', '/', realpath($_SERVER['SCRIPT_FILENAME']));
    $rel = substr($file, strlen($app));                 // e.g. "/api/index.php"
    $script = $_SERVER['SCRIPT_NAME'];                   // e.g. "/xampp/Quiz ni Dether/api/index.php"
    $path = substr($script, 0, strlen($script) - strlen($rel));
    $base = implode('/', array_map('rawurlencode', explode('/', $path)));
    return $base;
}

function lan_ip(): ?string
{
    $ip = gethostbyname(gethostname());
    if ($ip && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && strpos($ip, '127.') !== 0) return $ip;
    return null;
}

/** Student links of a quiz: ['main' => url, 'lan' => url|null] */
function share_links(string $code): array
{
    // On a server, APP_URL (e.g. https://quiz.example.com) makes the link exact.
    $appUrl = rtrim((string)getenv('APP_URL'), '/');
    if ($appUrl !== '') return ['main' => $appUrl . '/app/#/take/' . rawurlencode($code), 'lan' => null];

    // Behind a reverse proxy (Dokploy/Traefik) HTTPS ends at the proxy, which says so in X-Forwarded-Proto.
    $forwarded = strtolower(trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')[0]));
    $https = $forwarded === 'https' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
    $path = app_base_path() . '/app/#/take/' . rawurlencode($code);
    $main = $scheme . '://' . $host . $path;
    $lan = null;
    $hostOnly = strtolower(preg_replace('/:\d+$/', '', $host));
    if (in_array($hostOnly, ['localhost', '127.0.0.1', '::1', '[::1]'], true) && ($ip = lan_ip())) {
        $port = preg_match('/:(\d+)$/', $host, $m) ? ':' . $m[1] : '';
        $lan = $scheme . '://' . $ip . $port . $path;
    }
    return ['main' => $main, 'lan' => $lan];
}

function normalize_answer(?string $s): string
{
    $s = preg_replace('/\s+/u', ' ', trim((string)$s));
    return mb_strtolower($s, 'UTF-8');
}

/** Accepted answers for identification questions (one per line or separated by |). */
function accepted_answers(?string $answerText): array
{
    $parts = preg_split('/[\r\n|]+/', (string)$answerText);
    return array_values(array_filter(array_map('trim', $parts), fn($x) => $x !== ''));
}

/** Re-computes score / total / percentage of an attempt from its saved answers. */
function grade_attempt(PDO $db, int $attemptId): void
{
    $st = $db->prepare('SELECT quiz_id FROM attempts WHERE id = ?');
    $st->execute([$attemptId]);
    $quizId = $st->fetchColumn();
    if (!$quizId) return;

    $st = $db->prepare('SELECT * FROM questions WHERE quiz_id = ?');
    $st->execute([$quizId]);
    $questions = $st->fetchAll();

    $st = $db->prepare('SELECT c.question_id, c.id FROM choices c JOIN questions q ON q.id = c.question_id
                        WHERE q.quiz_id = ? AND c.is_correct = 1');
    $st->execute([$quizId]);
    $correct = [];
    foreach ($st->fetchAll() as $r) $correct[(int)$r['question_id']][] = (int)$r['id'];

    $st = $db->prepare('SELECT question_id, answer FROM attempt_answers WHERE attempt_id = ?');
    $st->execute([$attemptId]);
    $answers = [];
    foreach ($st->fetchAll() as $r) $answers[(int)$r['question_id']] = $r['answer'];

    $upd = $db->prepare('UPDATE attempt_answers SET is_correct = ?, points = ? WHERE attempt_id = ? AND question_id = ?');
    $total = 0.0;
    $score = 0.0;
    foreach ($questions as $q) {
        $qid = (int)$q['id'];
        $pts = (float)$q['points'];
        $total += $pts;
        if (!array_key_exists($qid, $answers)) continue;
        $given = $answers[$qid];
        if ($q['type'] === 'mcq') {
            $ok = $given !== null && $given !== '' && in_array((int)$given, $correct[$qid] ?? [], true);
        } elseif ($q['type'] === 'tf') {
            $ok = normalize_answer($given) !== '' && normalize_answer($given) === normalize_answer($q['answer_text']);
        } else {
            $g = normalize_answer($given);
            $ok = $g !== '' && in_array($g, array_map('normalize_answer', accepted_answers($q['answer_text'])), true);
        }
        if ($ok) $score += $pts;
        $upd->execute([$ok ? 1 : 0, $ok ? $pts : 0, $attemptId, $qid]);
    }
    $pct = $total > 0 ? round($score / $total * 100, 2) : 0;
    $db->prepare('UPDATE attempts SET score = ?, total_points = ?, percentage = ? WHERE id = ?')
       ->execute([$score, $total, $pct, $attemptId]);
}

function regrade_quiz(PDO $db, int $quizId): void
{
    $st = $db->prepare('SELECT id FROM attempts WHERE quiz_id = ?');
    $st->execute([$quizId]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) grade_attempt($db, (int)$id);
}

/** Ends an in-progress attempt. Returns false if it was already finished. */
function finish_attempt(PDO $db, int $id, string $status, ?string $reason = null, ?string $detail = null, ?string $note = null): bool
{
    $st = $db->prepare("UPDATE attempts SET status = ?, termination_reason = ?, termination_detail = ?, submit_note = ?,
                        finished_at = ?, admin_seen = 0 WHERE id = ? AND status = 'in_progress'");
    $st->execute([$status, $reason, $detail, $note, now(), $id]);
    if ($st->rowCount() > 0) {
        grade_attempt($db, $id);
        return true;
    }
    return false;
}

/** Finalizes attempts whose device stopped responding or whose time ran out long ago. */
function sweep_stale_attempts(PDO $db): void
{
    $cut = date('Y-m-d H:i:s', time() - HEARTBEAT_TIMEOUT);
    $late = date('Y-m-d H:i:s', time() - SUBMIT_GRACE_SECONDS);
    $st = $db->prepare("SELECT id, deadline, last_seen FROM attempts
                        WHERE status = 'in_progress' AND (last_seen < ? OR deadline < ?)");
    $st->execute([$cut, $late]);
    foreach ($st->fetchAll() as $a) {
        $lastSeen = strtotime($a['last_seen']);
        $deadline = strtotime($a['deadline']);
        if ($lastSeen >= $deadline - 15) {
            finish_attempt($db, (int)$a['id'], 'submitted', null, null, 'Time expired — auto-submitted by the system');
        } else {
            finish_attempt($db, (int)$a['id'], 'terminated', 'no_heartbeat',
                'Last signal from the student\'s device: ' . date('M j, Y g:i:s A', $lastSeen)
                . ' (' . fmt_duration($deadline - $lastSeen) . ' was still left on the timer).');
        }
    }
}
