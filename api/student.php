<?php
/* ===================== STUDENT (public, via quiz link) =====================
 *
 * Two timer modes:
 *  - whole:        all questions on one page, one countdown for the whole quiz.
 *  - per_question: one question at a time, each with its own countdown. When it runs out the
 *                  server moves to the next question; students can never go back. The server keeps
 *                  the current question (attempts.current_index) and when it started, so the time
 *                  cannot be cheated from the browser.
 */

const ATTEMPT_SELECT = 'SELECT a.*, q.show_result, q.passing_mode, q.passing_score, q.timer_mode,
                               q.time_seconds AS quiz_time_seconds, q.shuffle_questions
                        FROM attempts a JOIN quizzes q ON q.id = a.quiz_id ';

function clean_code(): string
{
    return preg_replace('/[^a-z0-9]/', '', strtolower(str_in('code')));
}

function load_attempt(PDO $db): array
{
    $token = str_in('token');
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) fail('Invalid attempt.', 400);
    $st = $db->prepare(ATTEMPT_SELECT . 'WHERE a.token = ?');
    $st->execute([$token]);
    $a = $st->fetch();
    if (!$a) fail('Attempt not found.', 404);
    return $a;
}

function reload_attempt(PDO $db, int $id): array
{
    $st = $db->prepare(ATTEMPT_SELECT . 'WHERE a.id = ?');
    $st->execute([$id]);
    return $st->fetch();
}

function is_per_question(array $a): bool
{
    return ($a['timer_mode'] ?? 'whole') === 'per_question';
}

function attempt_payload(array $a): array
{
    $p = [
        'status' => $a['status'],
        'reason' => $a['termination_reason'],
        'reason_text' => reason_text($a['termination_reason']),
        'seconds_left' => max(0, strtotime($a['deadline']) - time()),
        'show_result' => (bool)$a['show_result'],
    ];
    if ($a['show_result'] && $a['status'] === 'submitted') {
        $pass = passing_percent($a);
        $p += [
            'score' => fmt_num($a['score']),
            'total' => fmt_num($a['total_points']),
            'percentage' => fmt_num($a['percentage']),
            'passing' => fmt_num($pass),
            'passed' => (float)$a['percentage'] >= $pass,
        ];
    }
    return $p;
}

function save_answer(PDO $db, array $a, int $qid, string $answer): void
{
    $chk = $db->prepare('SELECT 1 FROM questions WHERE id = ? AND quiz_id = ?');
    $chk->execute([$qid, $a['quiz_id']]);
    if (!$chk->fetch()) return;
    $db->prepare('INSERT INTO attempt_answers (attempt_id, question_id, answer, answered_at) VALUES (?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE answer = VALUES(answer), answered_at = VALUES(answered_at)')
       ->execute([$a['id'], $qid, mb_substr($answer, 0, 1000), now()]);
}

function touch_attempt(PDO $db, array $a): void
{
    $db->prepare("UPDATE attempts SET last_seen = ? WHERE id = ? AND status = 'in_progress'")->execute([now(), $a['id']]);
}

/** The browser reports how often / how long it was offline (off_n, off_s); kept for the teacher. */
function record_offline(PDO $db, array $a): void
{
    $n = min(10000, max(0, int_in('off_n')));
    $s = min(86400 * 7, max(0, int_in('off_s')));
    // Short losses of focus the browser allowed (e.g. "10:02:15 AM (1.2s); 10:05:40 AM (3s)").
    $focus = str_in('focus_log', 500);
    if ($focus !== '') {
        $db->prepare('UPDATE attempts SET focus_log = ? WHERE id = ?')->execute([$focus, $a['id']]);
    }
    if (!$n && !$s) return;
    $db->prepare('UPDATE attempts SET offline_count = GREATEST(offline_count, ?), offline_seconds = GREATEST(offline_seconds, ?) WHERE id = ?')
       ->execute([$n, $s, $a['id']]);
}

/** Total of the per-question times from position $from to the end (with the network grace of each). */
function pq_remaining(array $order, array $times, array $a, int $from): int
{
    $sum = 0;
    for ($i = $from; $i < count($order); $i++) $sum += ($times[$order[$i]] ?? (int)$a['quiz_time_seconds']) + PER_QUESTION_GRACE;
    return $sum;
}

/**
 * Per-question mode: a question that is waiting for the device (question_started_at = NULL, because the
 * device was offline when the previous one ended) starts now, and the attempt's deadline moves with it.
 */
function pq_resume(PDO $db, array $a): array
{
    if ($a['status'] !== 'in_progress' || !is_per_question($a) || $a['question_started_at'] !== null) return $a;
    $order = pq_order($a);
    $idx = (int)$a['current_index'];
    if ($idx >= count($order)) {                       // the last question already ended: nothing left to show
        finish_attempt($db, (int)$a['id'], 'submitted', null, null, 'Time ran out on the last question — auto-submitted');
        return reload_attempt($db, (int)$a['id']);
    }
    $deadline = time() + pq_remaining($order, pq_times($db, $a), $a, $idx);
    $db->prepare("UPDATE attempts SET question_started_at = ?, deadline = ? WHERE id = ? AND status = 'in_progress'")
       ->execute([now(), date('Y-m-d H:i:s', $deadline), $a['id']]);
    return reload_attempt($db, (int)$a['id']);
}

/* ---------- per-question helpers ---------- */

function pq_order(array $a): array
{
    return array_map('intval', json_decode((string)$a['question_order'], true) ?: []);
}

/** question id => seconds allowed (its own time, or the quiz's time per question) */
function pq_times(PDO $db, array $a): array
{
    $st = $db->prepare('SELECT id, COALESCE(time_seconds, ?) AS secs FROM questions WHERE quiz_id = ?');
    $st->execute([(int)$a['quiz_time_seconds'], $a['quiz_id']]);
    $times = [];
    foreach ($st->fetchAll() as $r) $times[(int)$r['id']] = (int)$r['secs'];
    return $times;
}

/** Moves past questions whose time ran out while the browser was silent; finishes the attempt after the last one. */
function pq_sync(PDO $db, array $a): array
{
    if ($a['status'] !== 'in_progress' || !is_per_question($a) || $a['question_started_at'] === null) return $a;
    $order = pq_order($a);
    $times = pq_times($db, $a);
    $idx = (int)$a['current_index'];
    $start = strtotime((string)$a['question_started_at']);
    if ($idx >= count($order)) return $a;
    $limit = $times[$order[$idx]] ?? (int)$a['quiz_time_seconds'];
    if (time() <= $start + $limit + PER_QUESTION_GRACE) return $a;
    // The device did not send this question's answer in time (offline / closed). The question is over,
    // but the next one waits for the device (question_started_at = NULL): questions the student never saw
    // do not run out. It starts when the device is back (pq_resume). After the last question the attempt
    // also waits, so the answer the offline device locked in can still arrive (or the sweep closes it).
    $db->prepare("UPDATE attempts SET current_index = ?, question_started_at = NULL WHERE id = ? AND status = 'in_progress'")
       ->execute([$idx + 1, $a['id']]);
    return reload_attempt($db, (int)$a['id']);
}

/** The current question for the student (no answers), with its countdown. */
function pq_current(PDO $db, array $a): array
{
    $order = pq_order($a);
    $idx = (int)$a['current_index'];
    $times = pq_times($db, $a);
    $qid = $order[$idx];
    $st = $db->prepare('SELECT q.id, q.type, q.question, q.points, f.fkey AS figure FROM questions q
                        LEFT JOIN figures f ON f.id = q.figure_id WHERE q.id = ?');
    $st->execute([$qid]);
    $q = $st->fetch() ?: ['id' => $qid, 'type' => 'text', 'question' => '(This question was removed by the teacher.)', 'points' => 0, 'figure' => null];
    $choices = [];
    if ($q['type'] === 'mcq') {
        $st = $db->prepare('SELECT id, choice_text FROM choices WHERE question_id = ? ORDER BY sort_order, id');
        $st->execute([$qid]);
        $choices = array_map(fn($c) => ['id' => (int)$c['id'], 'text' => $c['choice_text']], $st->fetchAll());
        if ($a['shuffle_questions']) {                       // same order every time this attempt sees the question
            mt_srand(crc32($a['token'] . ':' . $qid));
            shuffle($choices);
            mt_srand();
        }
    }
    $limit = $times[$qid] ?? (int)$a['quiz_time_seconds'];
    $left = max(0, strtotime((string)$a['question_started_at']) + $limit - time());
    $later = 0;
    for ($i = $idx + 1; $i < count($order); $i++) $later += $times[$order[$i]] ?? (int)$a['quiz_time_seconds'];
    return [
        'mode' => 'per_question',
        'index' => $idx,
        'count' => count($order),
        'question' => [
            'id' => (int)$q['id'], 'type' => $q['type'], 'question' => $q['question'], 'figure' => $q['figure'],
            'points' => fmt_num($q['points']), 'choices' => $choices, 'seconds' => $limit,
        ],
        'question_seconds_left' => $left,
        'total_seconds_left' => $left + $later,
    ];
}

/* ---------- endpoints ---------- */

function h_take_info(PDO $db): void
{
    $st = $db->prepare('SELECT q.*, c.name AS class_name FROM quizzes q JOIN classes c ON c.id = q.class_id WHERE q.link_code = ?');
    $st->execute([clean_code()]);
    $q = $st->fetch();
    if (!$q) fail('This quiz link is invalid or has been replaced. Ask your teacher for the correct link.', 404);
    $st = $db->prepare('SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS pts, COUNT(time_seconds) AS custom FROM questions WHERE quiz_id = ?');
    $st->execute([$q['id']]);
    $c = $st->fetch();
    $total = quiz_total_seconds($db, $q);
    out([
        'quiz' => [
            'title' => $q['title'],
            'class_name' => $q['class_name'],
            'instructions' => (string)$q['instructions'],
            'timer_mode' => $q['timer_mode'],
            'timer_seconds' => (int)$q['time_seconds'],
            'timer_label' => fmt_timer((int)$q['time_seconds']),
            'varied_times' => (int)$c['custom'] > 0,
            'total_seconds' => $total,
            'total_label' => fmt_timer($total),
            'question_count' => (int)$c['n'],
            'total_points' => fmt_num($c['pts']),
            'passing' => fmt_num(passing_percent($q)),
            'is_open' => (bool)$q['is_open'],
        ],
        'reasons' => TERMINATION_REASONS,
        'focus' => ['seconds' => max(0, (int)FOCUS_GRACE_SECONDS), 'times' => max(0, (int)FOCUS_GRACE_TIMES)],
    ]);
}

function h_take_start(PDO $db): void
{
    $name = preg_replace('/\s+/u', ' ', str_in('full_name'));
    $section = preg_replace('/\s+/u', ' ', str_in('section'));
    if (mb_strlen($name) < 3 || mb_strlen($name) > 150) fail('Please enter your full name.');
    if ($section === '' || mb_strlen($section) > 100) fail('Please enter your section.');

    $st = $db->prepare('SELECT * FROM quizzes WHERE link_code = ?');
    $st->execute([clean_code()]);
    $quiz = $st->fetch();
    if (!$quiz) fail('This quiz link is invalid.');
    if (!$quiz['is_open']) fail('This quiz is closed and no longer accepting answers.');

    $st = $db->prepare('SELECT q.*, f.fkey AS figure FROM questions q LEFT JOIN figures f ON f.id = q.figure_id
                        WHERE q.quiz_id = ? ORDER BY q.sort_order, q.id');
    $st->execute([$quiz['id']]);
    $questions = $st->fetchAll();
    if (!$questions) fail('This quiz has no questions yet.');

    $st = $db->prepare('SELECT 1 FROM attempts WHERE quiz_id = ? AND full_name = ? AND section = ? LIMIT 1');
    $st->execute([$quiz['id'], $name, $section]);
    if ($st->fetch()) fail("You have already taken this quiz ($name, $section). Ask your teacher if you need a retake.");

    if ($quiz['shuffle_questions']) shuffle($questions);
    $perQuestion = $quiz['timer_mode'] === 'per_question';
    $totalPoints = array_sum(array_map(fn($q) => (float)$q['points'], $questions));
    $order = array_map(fn($q) => (int)$q['id'], $questions);
    $start = time();
    $duration = $perQuestion
        ? array_sum(array_map(fn($q) => (int)($q['time_seconds'] ?? $quiz['time_seconds']), $questions)) + count($questions) * PER_QUESTION_GRACE
        : (int)$quiz['time_seconds'];

    $token = bin2hex(random_bytes(24));
    $note = str_in('fs') === '0' ? 'Full-screen not supported on this device/browser (tab-switch monitoring only).' : null;
    $db->prepare('INSERT INTO attempts (quiz_id, token, full_name, section, client_note, question_order, current_index, question_started_at,
                  started_at, deadline, last_seen, total_points, ip, user_agent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
       ->execute([$quiz['id'], $token, $name, $section, $note, json_encode($order), 0, $perQuestion ? date('Y-m-d H:i:s', $start) : null,
                  date('Y-m-d H:i:s', $start), date('Y-m-d H:i:s', $start + $duration), date('Y-m-d H:i:s', $start),
                  $totalPoints, $_SERVER['REMOTE_ADDR'] ?? null, mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255)]);

    $base = ['token' => $token, 'full_name' => $name, 'section' => $section];
    if ($perQuestion) {
        $a = reload_attempt($db, (int)$db->lastInsertId());
        out($base + pq_current($db, $a));
    }

    // Whole-quiz mode: send every question at once.
    $in = implode(',', $order);
    $choices = [];
    foreach ($db->query("SELECT id, question_id, choice_text FROM choices WHERE question_id IN ($in) ORDER BY sort_order, id") as $c) {
        $choices[(int)$c['question_id']][] = ['id' => (int)$c['id'], 'text' => $c['choice_text']];
    }
    $list = [];
    foreach ($questions as $q) {
        $ch = $choices[(int)$q['id']] ?? [];
        if ($quiz['shuffle_questions']) shuffle($ch);
        $list[] = ['id' => (int)$q['id'], 'type' => $q['type'], 'question' => $q['question'], 'figure' => $q['figure'], 'points' => fmt_num($q['points']),
                   'choices' => $q['type'] === 'mcq' ? $ch : []];
    }
    out($base + ['mode' => 'whole', 'seconds_left' => (int)$quiz['time_seconds'], 'questions' => $list]);
}

/** Per-question mode: send the answer for the current question (may be blank) and get the next one. */
function h_take_next(PDO $db): void
{
    $a = load_attempt($db);
    if (!is_per_question($a)) fail('This quiz does not use a timer per question.');
    record_offline($db, $a);
    $a = pq_sync($db, $a);
    if ($a['status'] !== 'in_progress') out(attempt_payload($a) + ['done' => true]);

    $order = pq_order($a);
    $idx = (int)$a['current_index'];
    $qid = int_in('question_id');
    if ($a['question_started_at'] === null && $idx > 0 && $qid === $order[$idx - 1]) {
        // The device was offline when its question ended; this is the answer it locked in at that time.
        $answer = str_in('answer');
        $has = scalar($db, 'SELECT COUNT(*) FROM attempt_answers WHERE attempt_id = ? AND question_id = ?', [$a['id'], $qid]);
        if ($answer !== '' && !$has) save_answer($db, $a, $qid, $answer);
    }
    $a = pq_resume($db, $a);
    if ($a['status'] !== 'in_progress') out(attempt_payload($a) + ['done' => true]);
    if ($qid === $order[$idx]) {
        // Answer belongs to the question that is still open (sync above already closed late ones).
        $answer = str_in('answer');
        if ($answer !== '') save_answer($db, $a, $order[$idx], $answer);
        $idx++;
        $db->prepare("UPDATE attempts SET current_index = ?, question_started_at = ?, last_seen = ? WHERE id = ? AND status = 'in_progress'")
           ->execute([$idx, now(), now(), $a['id']]);
    } else {
        touch_attempt($db, $a);
    }
    if ($idx >= count($order)) {
        finish_attempt($db, (int)$a['id'], 'submitted', null, null, 'Answered all questions');
        out(attempt_payload(reload_attempt($db, (int)$a['id'])) + ['done' => true]);
    }
    $a = reload_attempt($db, (int)$a['id']);
    out(attempt_payload($a) + pq_current($db, $a));
}

function h_take_save(PDO $db): void
{
    $a = load_attempt($db);
    if ($a['status'] !== 'in_progress') out(attempt_payload($a));
    if (is_per_question($a)) fail('Answers are sent with each question in this quiz.');
    if (time() > strtotime($a['deadline']) + 30) fail('Time is up.');
    // One answer (question_id + answer), or many at once (answers: {question_id: answer}) after being offline.
    $many = input()['answers'] ?? null;
    if (is_array($many)) {
        foreach (array_slice($many, 0, 1000, true) as $qid => $ans) {
            if (is_scalar($ans)) save_answer($db, $a, (int)$qid, (string)$ans);
        }
    } else {
        save_answer($db, $a, int_in('question_id'), str_in('answer'));
    }
    touch_attempt($db, $a);
    record_offline($db, $a);
    out(['status' => 'in_progress', 'seconds_left' => max(0, strtotime($a['deadline']) - time())]);
}

function h_take_heartbeat(PDO $db): void
{
    $a = load_attempt($db);
    record_offline($db, $a);
    $a = pq_resume($db, pq_sync($db, $a));
    if ($a['status'] === 'in_progress') touch_attempt($db, $a);
    $p = attempt_payload($a);
    if ($a['status'] === 'in_progress' && is_per_question($a)) {
        $cur = pq_current($db, $a);
        // The browser only needs the question again if the server moved on without it.
        if (int_in('index') !== $cur['index']) $p += $cur;
        else $p += ['index' => $cur['index'], 'question_seconds_left' => $cur['question_seconds_left'], 'total_seconds_left' => $cur['total_seconds_left']];
    }
    out($p);
}

function h_take_status(PDO $db): void
{
    out(attempt_payload(pq_sync($db, load_attempt($db))));
}

function h_take_submit(PDO $db): void
{
    $a = load_attempt($db);
    if ($a['status'] !== 'in_progress') out(attempt_payload($a));
    record_offline($db, $a);
    $deadline = strtotime($a['deadline']);
    // Answers locked in by a device that was offline when the time ended may arrive later.
    $offline = bool_in('offline');
    $lateBy = time() - $deadline;
    $accept = time() <= $deadline + SUBMIT_GRACE_SECONDS || ($offline && time() <= $deadline + OFFLINE_GRACE_SECONDS);
    if (!is_per_question($a) && $accept) {
        foreach (array_slice((array)(input()['answers'] ?? []), 0, 1000, true) as $qid => $ans) {
            if (is_scalar($ans)) save_answer($db, $a, (int)$qid, (string)$ans);
        }
    }
    $auto = bool_in('auto') || time() > $deadline;
    $note = $auto ? 'Time expired — auto-submitted' : 'Submitted by student';
    if ($offline && $lateBy > SUBMIT_GRACE_SECONDS) {
        $note .= ' (reached the server ' . fmt_timer($lateBy) . ' after the time ended because the device was offline'
               . ($accept ? '; answers were locked when the time ended' : '; too late, only answers saved earlier were kept') . ')';
    }
    finish_attempt($db, (int)$a['id'], 'submitted', null, null, $note);
    out(attempt_payload(reload_attempt($db, (int)$a['id'])));
}

function h_take_terminate(PDO $db): void
{
    $a = load_attempt($db);
    if ($a['status'] !== 'in_progress') out(attempt_payload($a));
    record_offline($db, $a);
    $reason = str_in('reason');
    if (!isset(TERMINATION_REASONS[$reason])) $reason = 'page_unload';
    finish_attempt($db, (int)$a['id'], 'terminated', $reason, str_in('detail', 1000) ?: null);
    out(attempt_payload(reload_attempt($db, (int)$a['id'])));
}
