<?php
function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data + ['ok' => true]);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

/** Request input: JSON body, form data, or query string. */
function input(): array
{
    static $in = null;
    if ($in !== null) return $in;
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') !== false) {
        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
    } else {
        $in = $_POST;
    }
    $in += $_GET;
    return $in;
}

function str_in(string $key, int $max = 0): string
{
    $v = input()[$key] ?? '';
    $v = is_scalar($v) ? trim((string)$v) : '';
    return $max ? mb_substr($v, 0, $max) : $v;
}

function int_in(string $key): int
{
    $v = input()[$key] ?? 0;
    return is_numeric($v) ? (int)$v : 0;
}

function bool_in(string $key): bool
{
    $v = input()[$key] ?? false;
    return $v === true || $v === 1 || $v === '1' || $v === 'true';
}

/** Reads timer_value + timer_unit (seconds|minutes|hours) and returns [seconds, unit]. */
function timer_in(string $prefix = 'timer'): array
{
    $unit = str_in($prefix . '_unit');
    if (!isset(TIME_UNITS[$unit])) $unit = 'minutes';
    $v = input()[$prefix . '_value'] ?? 0;
    $secs = is_numeric($v) ? (int)round((float)$v * TIME_UNITS[$unit]) : 0;
    if ($secs < 5) fail('The timer must be at least 5 seconds.');
    if ($secs > 86400) fail('The timer can be at most 24 hours.');
    return [$secs, $unit];
}

function timer_payload(int $secs, string $unit): array
{
    return ['timer_seconds' => $secs, 'timer_unit' => $unit, 'timer_label' => fmt_timer($secs)];
}

/** Admin endpoints need a session and the custom header (blocks cross-site form posts). */
function require_xhr(): void
{
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'QND') fail('Bad request.', 400);
}

function admin_guard(): void
{
    require_xhr();
    if (empty($_SESSION['admin_id'])) fail('Please log in.', 401);
    // The account may have been deleted since this session started.
    $st = db()->prepare('SELECT 1 FROM admins WHERE id = ?');
    $st->execute([(int)$_SESSION['admin_id']]);
    if (!$st->fetch()) {
        unset($_SESSION['admin_id']);
        fail('Please log in.', 401);
    }
}

function attempt_row(array $a): array
{
    $pass = passing_percent($a);
    if ($a['status'] === 'in_progress') $result = 'in_progress';
    elseif ($a['status'] === 'terminated') $result = 'terminated';
    else $result = (float)$a['percentage'] >= $pass ? 'passed' : 'failed';
    $end = $a['finished_at'] ? strtotime($a['finished_at']) : time();
    return [
        'id' => (int)$a['id'],
        'quiz_id' => (int)$a['quiz_id'],
        'quiz_title' => $a['quiz_title'] ?? null,
        'class_name' => $a['class_name'] ?? null,
        'full_name' => $a['full_name'],
        'section' => $a['section'],
        'status' => $a['status'],
        'result' => $result,
        'score' => fmt_num($a['score']),
        'total' => fmt_num($a['total_points']),
        'percentage' => fmt_num($a['percentage']),
        'passing' => fmt_num($pass),
        'reason' => $a['termination_reason'],
        'reason_text' => reason_text($a['termination_reason']),
        'detail' => $a['termination_detail'],
        'submit_note' => $a['submit_note'],
        'client_note' => $a['client_note'],
        'started_at' => $a['started_at'],
        'finished_at' => $a['finished_at'],
        'duration' => max(0, $end - strtotime($a['started_at'])),
        'seconds_left' => max(0, strtotime($a['deadline']) - time()),
        'is_new' => $a['status'] === 'terminated' && !$a['admin_seen'],
        'no_signal' => $a['status'] === 'in_progress' && strtotime($a['last_seen']) < time() - HEARTBEAT_TIMEOUT,
        'last_seen' => $a['last_seen'],
        'offline_count' => (int)($a['offline_count'] ?? 0),
        'offline_seconds' => (int)($a['offline_seconds'] ?? 0),
        'ip' => $a['ip'],
        'user_agent' => $a['user_agent'],
    ];
}
