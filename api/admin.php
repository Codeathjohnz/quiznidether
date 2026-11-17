<?php
/*
 * Teacher (admin) endpoints. Every query is limited to the logged-in teacher's own
 * classes -> quizzes -> attempts, so teachers never see each other's data.
 */

const ATTEMPT_SQL = 'SELECT a.*, q.title AS quiz_title, q.passing_mode, q.passing_score, c.name AS class_name
                     FROM attempts a JOIN quizzes q ON q.id = a.quiz_id JOIN classes c ON c.id = q.class_id ';

function owned_attempts(PDO $db, string $where = '', array $params = [], string $tail = ''): array
{
    $st = $db->prepare(ATTEMPT_SQL . 'WHERE c.owner_id = ?' . ($where !== '' ? " AND $where" : '') . ' ' . $tail);
    $st->execute(array_merge([uid()], $params));
    return $st->fetchAll();
}

/* ===================== DASHBOARD ===================== */

function nav_counts(PDO $db): array
{
    sweep_stale_attempts($db);
    $base = 'SELECT COUNT(*) FROM attempts a JOIN quizzes q ON q.id = a.quiz_id JOIN classes c ON c.id = q.class_id WHERE c.owner_id = ? ';
    return [
        'unseen' => scalar($db, $base . "AND a.status = 'terminated' AND a.admin_seen = 0", [uid()]),
        'live'   => scalar($db, $base . "AND a.status = 'in_progress'", [uid()]),
    ];
}

function h_nav(PDO $db): void
{
    admin_guard();
    $me = current_admin($db);
    $extra = ['reviewNeeded' => review_needed($db, $me)];
    if (is_developer($db, $me)) $extra['newReviews'] = (int)$db->query("SELECT COUNT(*) FROM reviews WHERE status = 'new'")->fetchColumn();
    out(nav_counts($db) + $extra);
}

function h_dashboard(PDO $db): void
{
    admin_guard();
    $nav = nav_counts($db);
    $byStatus = 'SELECT COUNT(*) FROM attempts a JOIN quizzes q ON q.id = a.quiz_id JOIN classes c ON c.id = q.class_id
                 WHERE c.owner_id = ? AND a.status = ?';
    out([
        'nav' => $nav,
        'stats' => [
            'classes'    => scalar($db, 'SELECT COUNT(*) FROM classes WHERE owner_id = ?', [uid()]),
            'quizzes'    => scalar($db, 'SELECT COUNT(*) FROM quizzes q JOIN classes c ON c.id = q.class_id WHERE c.owner_id = ?', [uid()]),
            'submitted'  => scalar($db, $byStatus, [uid(), 'submitted']),
            'terminated' => scalar($db, $byStatus, [uid(), 'terminated']),
        ],
        'live'       => array_map('attempt_row', owned_attempts($db, "a.status = 'in_progress'", [], 'ORDER BY a.started_at DESC')),
        'violations' => array_map('attempt_row', owned_attempts($db, "a.status = 'terminated'", [], 'ORDER BY a.finished_at DESC LIMIT 10')),
        'recent'     => array_map('attempt_row', owned_attempts($db, "a.status = 'submitted'", [], 'ORDER BY a.finished_at DESC LIMIT 10')),
    ]);
}

/* ===================== CLASSES ===================== */

function h_classes_list(PDO $db): void
{
    admin_guard();
    $st = $db->prepare('SELECT c.*,
            (SELECT COUNT(*) FROM quizzes q WHERE q.class_id = c.id) AS quiz_count,
            (SELECT COUNT(*) FROM attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE q.class_id = c.id) AS attempt_count
        FROM classes c WHERE c.owner_id = ? ORDER BY c.created_at DESC');
    $st->execute([uid()]);
    out(['classes' => array_map(fn($c) => [
        'id' => (int)$c['id'],
        'name' => $c['name'],
        'description' => (string)$c['description'],
        'quiz_count' => (int)$c['quiz_count'],
        'attempt_count' => (int)$c['attempt_count'],
        'created_at' => $c['created_at'],
    ] + timer_payload((int)$c['default_time_seconds'], $c['default_time_unit']), $st->fetchAll())]);
}

function h_classes_save(PDO $db): void
{
    admin_guard();
    $id = int_in('id');
    $name = str_in('name');
    $desc = str_in('description', 5000);
    if ($name === '' || mb_strlen($name) > 150) fail('Class name is required (max 150 characters).');
    [$secs, $unit] = timer_in();
    if ($id) {
        if (!scalar($db, 'SELECT COUNT(*) FROM classes WHERE id = ? AND owner_id = ?', [$id, uid()])) fail('Class not found.', 404);
        $db->prepare('UPDATE classes SET name = ?, description = ?, default_time_seconds = ?, default_time_unit = ? WHERE id = ?')
           ->execute([$name, $desc, $secs, $unit, $id]);
        if (bool_in('apply_timer')) {
            $db->prepare('UPDATE quizzes SET time_seconds = ?, time_unit = ?, updated_at = ? WHERE class_id = ?')->execute([$secs, $unit, now(), $id]);
        }
    } else {
        $db->prepare('INSERT INTO classes (owner_id, name, description, default_time_seconds, default_time_unit, created_at) VALUES (?, ?, ?, ?, ?, ?)')
           ->execute([uid(), $name, $desc, $secs, $unit, now()]);
        $id = (int)$db->lastInsertId();
    }
    out(['id' => $id]);
}

function h_classes_delete(PDO $db): void
{
    admin_guard();
    $db->prepare('DELETE FROM classes WHERE id = ? AND owner_id = ?')->execute([int_in('id'), uid()]);
    out([]);
}

/* ===================== QUIZZES ===================== */

function quiz_row(array $q): array
{
    return [
        'id' => (int)$q['id'],
        'class_id' => (int)$q['class_id'],
        'class_name' => $q['class_name'] ?? null,
        'title' => $q['title'],
        'instructions' => (string)$q['instructions'],
        'timer_seconds' => (int)$q['time_seconds'],
        'timer_unit' => $q['time_unit'],
        'timer_label' => fmt_timer((int)$q['time_seconds']),
        'timer_mode' => $q['timer_mode'],
        'total_seconds' => $q['timer_mode'] === 'per_question' ? (int)$q['pq_total'] : (int)$q['time_seconds'],
        'total_label' => fmt_timer($q['timer_mode'] === 'per_question' ? (int)$q['pq_total'] : (int)$q['time_seconds']),
        'custom_time_count' => (int)$q['custom_time_count'],
        'passing_mode' => $q['passing_mode'],
        'passing_score' => fmt_num($q['passing_score']),
        'passing' => fmt_num(passing_percent($q)),
        'shuffle_questions' => (bool)$q['shuffle_questions'],
        'show_result' => (bool)$q['show_result'],
        'is_open' => (bool)$q['is_open'],
        'links' => share_links($q['link_code']),
        'question_count' => (int)$q['question_count'],
        'total_points' => fmt_num($q['total_points']),
        'submitted_count' => (int)$q['submitted_count'],
        'terminated_count' => (int)$q['terminated_count'],
        'live_count' => (int)$q['live_count'],
    ];
}

const QUIZ_SQL = "SELECT q.*, c.name AS class_name,
      (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) AS question_count,
      (SELECT COALESCE(SUM(points),0) FROM questions x WHERE x.quiz_id = q.id) AS total_points,
      (SELECT COALESCE(SUM(COALESCE(x.time_seconds, q.time_seconds)),0) FROM questions x WHERE x.quiz_id = q.id) AS pq_total,
      (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id AND x.time_seconds IS NOT NULL) AS custom_time_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id AND a.status = 'submitted') AS submitted_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id AND a.status = 'terminated') AS terminated_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id AND a.status = 'in_progress') AS live_count
    FROM quizzes q JOIN classes c ON c.id = q.class_id WHERE c.owner_id = ?";

/** Loads a quiz that belongs to the logged-in teacher (fails with 404 otherwise). */
function load_quiz(PDO $db, int $id): array
{
    $st = $db->prepare(QUIZ_SQL . ' AND q.id = ?');
    $st->execute([uid(), $id]);
    $q = $st->fetch();
    if (!$q) fail('Quiz not found.', 404);
    return $q;
}

function class_options(PDO $db): array
{
    $st = $db->prepare('SELECT id, name, default_time_seconds, default_time_unit FROM classes WHERE owner_id = ? ORDER BY name');
    $st->execute([uid()]);
    return array_map(fn($c) => ['id' => (int)$c['id'], 'name' => $c['name']]
        + timer_payload((int)$c['default_time_seconds'], $c['default_time_unit']), $st->fetchAll());
}

function h_quizzes_list(PDO $db): void
{
    admin_guard();
    sweep_stale_attempts($db);
    $classId = int_in('class_id');
    if ($classId) {
        $st = $db->prepare(QUIZ_SQL . ' AND q.class_id = ? ORDER BY q.created_at DESC');
        $st->execute([uid(), $classId]);
    } else {
        $st = $db->prepare(QUIZ_SQL . ' ORDER BY q.created_at DESC');
        $st->execute([uid()]);
    }
    out(['quizzes' => array_map('quiz_row', $st->fetchAll()), 'classes' => class_options($db)]);
}

function h_quizzes_form(PDO $db): void
{
    admin_guard();
    $id = int_in('id');
    out(['quiz' => $id ? quiz_row(load_quiz($db, $id)) : null, 'classes' => class_options($db), 'autoPassing' => AUTO_PASSING_PERCENT]);
}

function h_quizzes_save(PDO $db): void
{
    admin_guard();
    $id = int_in('id');
    $classIds = array_column(class_options($db), 'id');
    $d = [
        'class_id' => int_in('class_id'),
        'title' => str_in('title'),
        'instructions' => str_in('instructions', 10000),
        'time_seconds' => 0,
        'time_unit' => 'minutes',
        'timer_mode' => str_in('timer_mode') === 'per_question' ? 'per_question' : 'whole',
        'passing_mode' => str_in('passing_mode') === 'manual' ? 'manual' : 'auto',
        'passing_score' => (float)(input()['passing_score'] ?? AUTO_PASSING_PERCENT),
        'shuffle_questions' => bool_in('shuffle_questions') ? 1 : 0,
        'show_result' => bool_in('show_result') ? 1 : 0,
        'is_open' => bool_in('is_open') ? 1 : 0,
    ];
    if (!in_array($d['class_id'], $classIds, true)) fail('Choose a class.');
    if ($d['title'] === '' || mb_strlen($d['title']) > 200) fail('Title is required (max 200 characters).');
    [$d['time_seconds'], $d['time_unit']] = timer_in();
    if ($d['passing_mode'] === 'manual' && ($d['passing_score'] <= 0 || $d['passing_score'] > 100)) fail('Passing score must be between 1 and 100%.');
    if ($d['passing_mode'] === 'auto') $d['passing_score'] = AUTO_PASSING_PERCENT;

    if ($id) {
        load_quiz($db, $id);
        $db->prepare('UPDATE quizzes SET class_id=?, title=?, instructions=?, time_seconds=?, time_unit=?, timer_mode=?, passing_mode=?, passing_score=?,
                      shuffle_questions=?, show_result=?, is_open=?, updated_at=? WHERE id=?')
           ->execute([...array_values($d), now(), $id]);
    } else {
        $db->prepare('INSERT INTO quizzes (class_id, title, instructions, time_seconds, time_unit, timer_mode, passing_mode, passing_score,
                      shuffle_questions, show_result, is_open, link_code, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([...array_values($d), unique_link_code($db), now(), now()]);
        $id = (int)$db->lastInsertId();
    }
    out(['id' => $id]);
}

function h_quizzes_delete(PDO $db): void
{
    admin_guard();
    $q = load_quiz($db, int_in('id'));
    $db->prepare('DELETE FROM quizzes WHERE id = ?')->execute([$q['id']]);
    out([]);
}

function h_quizzes_toggle(PDO $db): void
{
    admin_guard();
    $q = load_quiz($db, int_in('id'));
    $db->prepare('UPDATE quizzes SET is_open = 1 - is_open, updated_at = ? WHERE id = ?')->execute([now(), $q['id']]);
    out([]);
}

function h_quizzes_regen(PDO $db): void
{
    admin_guard();
    $q = load_quiz($db, int_in('id'));
    $db->prepare('UPDATE quizzes SET link_code = ?, updated_at = ? WHERE id = ?')->execute([unique_link_code($db), now(), $q['id']]);
    out([]);
}

/* ===================== QUESTIONS ===================== */

function h_questions_list(PDO $db): void
{
    admin_guard();
    $quizId = int_in('quiz_id');
    $quiz = quiz_row(load_quiz($db, $quizId));
    $st = $db->prepare('SELECT q.*, f.fkey AS figure FROM questions q LEFT JOIN figures f ON f.id = q.figure_id
                        WHERE q.quiz_id = ? ORDER BY q.sort_order, q.id');
    $st->execute([$quizId]);
    $questions = $st->fetchAll();
    $choices = [];
    if ($questions) {
        $in = implode(',', array_map('intval', array_column($questions, 'id')));
        foreach ($db->query("SELECT * FROM choices WHERE question_id IN ($in) ORDER BY sort_order, id") as $c) {
            $choices[(int)$c['question_id']][] = ['id' => (int)$c['id'], 'text' => $c['choice_text'], 'correct' => (bool)$c['is_correct']];
        }
    }
    out([
        'quiz' => $quiz,
        'attempt_count' => scalar($db, 'SELECT COUNT(*) FROM attempts WHERE quiz_id = ?', [$quizId]),
        'questions' => array_map(fn($q) => [
            'id' => (int)$q['id'],
            'type' => $q['type'],
            'question' => $q['question'],
            'figure' => $q['figure'],
            'points' => fmt_num($q['points']),
            'choices' => $choices[(int)$q['id']] ?? [],
            'tf_answer' => $q['type'] === 'tf' ? ($q['answer_text'] === 'false' ? 'false' : 'true') : 'true',
            'accepted' => $q['type'] === 'text' ? accepted_answers($q['answer_text']) : [],
            'custom_time' => $q['time_seconds'] !== null,
            'time_seconds' => $q['time_seconds'] !== null ? (int)$q['time_seconds'] : $quiz['timer_seconds'],
            'time_unit' => $q['time_unit'] ?? $quiz['timer_unit'],
            'time_label' => fmt_timer($q['time_seconds'] !== null ? (int)$q['time_seconds'] : $quiz['timer_seconds']),
        ], $questions),
    ]);
}

function question_in_quiz(PDO $db, int $quizId, int $qid): bool
{
    return (bool)scalar($db, 'SELECT COUNT(*) FROM questions WHERE id = ? AND quiz_id = ?', [$qid, $quizId]);
}

function h_questions_save(PDO $db): void
{
    admin_guard();
    $in = input();
    $quizId = int_in('quiz_id');
    load_quiz($db, $quizId);
    $qid = int_in('id');
    if ($qid && !question_in_quiz($db, $quizId, $qid)) fail('Question not found.', 404);

    $type = in_array($in['type'] ?? '', ['mcq', 'tf', 'text'], true) ? $in['type'] : 'mcq';
    $text = str_in('question', 10000);
    $points = (float)($in['points'] ?? 1);
    [$qSecs, $qUnit] = bool_in('custom_time') ? timer_in('q_timer') : [null, null];
    $answerText = null;
    $choiceRows = [];
    $figureKey = str_in('figure', 40);
    $figureId = $figureKey !== '' ? figure_id_of($db, $figureKey) : null;
    if ($figureId === 0) fail('The figure was not found. Please add the picture again.');
    if ($text === '') fail('Question text is required.');
    if ($points <= 0 || $points > 1000) fail('Points must be greater than 0.');
    if ($type === 'mcq') {
        foreach ((array)($in['choices'] ?? []) as $c) {
            $t = trim((string)($c['text'] ?? ''));
            if ($t === '') continue;
            $choiceRows[] = ['id' => (int)($c['id'] ?? 0), 'text' => mb_substr($t, 0, 2000), 'correct' => !empty($c['correct'])];
        }
        if (count($choiceRows) < 2) fail('Multiple choice needs at least 2 choices.');
        if (!array_filter(array_column($choiceRows, 'correct'))) fail('Select which choice is the correct answer.');
    } elseif ($type === 'tf') {
        $answerText = ($in['tf_answer'] ?? '') === 'false' ? 'false' : 'true';
    } else {
        $accepted = accepted_answers(is_array($in['accepted'] ?? null) ? implode("\n", $in['accepted']) : (string)($in['accepted'] ?? ''));
        if (!$accepted) fail('Enter at least one accepted answer.');
        $answerText = implode("\n", $accepted);
    }

    $db->beginTransaction();
    if ($qid) {
        $db->prepare('UPDATE questions SET type = ?, question = ?, answer_text = ?, figure_id = ?, points = ?, time_seconds = ?, time_unit = ? WHERE id = ?')
           ->execute([$type, $text, $answerText, $figureId, $points, $qSecs, $qUnit, $qid]);
    } else {
        $max = scalar($db, 'SELECT COALESCE(MAX(sort_order), 0) FROM questions WHERE quiz_id = ?', [$quizId]);
        $db->prepare('INSERT INTO questions (quiz_id, type, question, answer_text, figure_id, points, time_seconds, time_unit, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$quizId, $type, $text, $answerText, $figureId, $points, $qSecs, $qUnit, $max + 1]);
        $qid = (int)$db->lastInsertId();
    }
    // Sync choices, keeping ids so earlier student answers stay linked.
    $existing = $db->prepare('SELECT id FROM choices WHERE question_id = ?');
    $existing->execute([$qid]);
    $existing = array_map('intval', $existing->fetchAll(PDO::FETCH_COLUMN));
    $keep = [];
    if ($type === 'mcq') {
        $upd = $db->prepare('UPDATE choices SET choice_text = ?, is_correct = ?, sort_order = ? WHERE id = ?');
        $ins = $db->prepare('INSERT INTO choices (question_id, choice_text, is_correct, sort_order) VALUES (?, ?, ?, ?)');
        foreach ($choiceRows as $i => $c) {
            if ($c['id'] && in_array($c['id'], $existing, true)) {
                $upd->execute([$c['text'], $c['correct'] ? 1 : 0, $i, $c['id']]);
                $keep[] = $c['id'];
            } else {
                $ins->execute([$qid, $c['text'], $c['correct'] ? 1 : 0, $i]);
                $keep[] = (int)$db->lastInsertId();
            }
        }
    }
    $del = $db->prepare('DELETE FROM choices WHERE id = ?');
    foreach (array_diff($existing, $keep) as $old) $del->execute([$old]);
    $db->commit();
    regrade_quiz($db, $quizId);
    out(['id' => $qid]);
}

function h_questions_delete(PDO $db): void
{
    admin_guard();
    $quizId = int_in('quiz_id');
    load_quiz($db, $quizId);
    $qid = int_in('id');
    if (!question_in_quiz($db, $quizId, $qid)) fail('Question not found.', 404);
    $db->prepare('DELETE FROM questions WHERE id = ?')->execute([$qid]);
    regrade_quiz($db, $quizId);
    out([]);
}

function h_questions_move(PDO $db): void
{
    admin_guard();
    $quizId = int_in('quiz_id');
    load_quiz($db, $quizId);
    $qid = int_in('id');
    $st = $db->prepare('SELECT id FROM questions WHERE quiz_id = ? ORDER BY sort_order, id');
    $st->execute([$quizId]);
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $pos = array_search($qid, $ids, true);
    if ($pos === false) fail('Question not found.', 404);
    $swap = str_in('direction') === 'up' ? $pos - 1 : $pos + 1;
    if (isset($ids[$swap])) {
        [$ids[$pos], $ids[$swap]] = [$ids[$swap], $ids[$pos]];
        $u = $db->prepare('UPDATE questions SET sort_order = ? WHERE id = ?');
        foreach ($ids as $i => $id) $u->execute([$i + 1, $id]);
    }
    out([]);
}

/* ===================== RESULTS ===================== */

function results_query(PDO $db): array
{
    $quizId = int_in('quiz_id');
    $status = in_array(str_in('status'), ['in_progress', 'submitted', 'terminated'], true) ? str_in('status') : '';
    $search = str_in('q', 100);
    $where = [];
    $params = [];
    if ($quizId) { $where[] = 'a.quiz_id = ?'; $params[] = $quizId; }
    if ($status) { $where[] = 'a.status = ?'; $params[] = $status; }
    if ($search !== '') { $where[] = '(a.full_name LIKE ? OR a.section LIKE ?)'; $params[] = "%$search%"; $params[] = "%$search%"; }
    return owned_attempts($db, implode(' AND ', $where), $params, 'ORDER BY a.started_at DESC LIMIT 2000');
}

function h_results_list(PDO $db): void
{
    admin_guard();
    sweep_stale_attempts($db);
    $rows = array_map('attempt_row', results_query($db));

    $sum = ['total' => count($rows), 'submitted' => 0, 'terminated' => 0, 'live' => 0, 'passed' => 0, 'average' => null, 'pass_rate' => null];
    $pctSum = 0;
    foreach ($rows as $r) {
        if ($r['status'] === 'submitted') {
            $sum['submitted']++;
            $pctSum += (float)$r['percentage'];
            if ($r['result'] === 'passed') $sum['passed']++;
        } elseif ($r['status'] === 'terminated') $sum['terminated']++;
        else $sum['live']++;
    }
    if ($sum['submitted']) {
        $sum['average'] = fmt_num(round($pctSum / $sum['submitted'], 1));
        $sum['pass_rate'] = fmt_num(round($sum['passed'] / $sum['submitted'] * 100, 1));
    }
    $newIds = array_column(array_filter($rows, fn($r) => $r['is_new']), 'id');
    if ($newIds) $db->exec('UPDATE attempts SET admin_seen = 1 WHERE id IN (' . implode(',', array_map('intval', $newIds)) . ')');

    $quizId = int_in('quiz_id');
    $st = $db->prepare('SELECT q.id, q.title, c.name AS class_name FROM quizzes q JOIN classes c ON c.id = q.class_id
                        WHERE c.owner_id = ? ORDER BY c.name, q.title');
    $st->execute([uid()]);
    out([
        'rows' => $rows,
        'summary' => $sum,
        'quiz' => $quizId ? quiz_row(load_quiz($db, $quizId)) : null,
        'quizzes' => array_map(fn($q) => ['id' => (int)$q['id'], 'title' => $q['title'], 'class_name' => $q['class_name']], $st->fetchAll()),
    ]);
}

function h_results_export(PDO $db): void
{
    if (!uid()) fail('Please log in.', 401);
    $rows = array_map('attempt_row', results_query($db));
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="results-' . date('Ymd-His') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Full name', 'Section', 'Class', 'Quiz', 'Status', 'Score', 'Total', 'Percentage', 'Passing %', 'Result',
                   'Termination reason', 'Details', 'Started', 'Finished', 'IP']);
    foreach ($rows as $r) {
        fputcsv($out, [$r['full_name'], $r['section'], $r['class_name'], $r['quiz_title'], $r['status'], $r['score'], $r['total'],
            $r['percentage'], $r['passing'], $r['result'], $r['reason_text'], $r['detail'] ?: $r['submit_note'],
            $r['started_at'], $r['finished_at'], $r['ip']]);
    }
    exit;
}

function h_results_regrade(PDO $db): void
{
    admin_guard();
    $q = load_quiz($db, int_in('quiz_id'));
    regrade_quiz($db, (int)$q['id']);
    out([]);
}

function load_owned_attempt(PDO $db, int $id): array
{
    $rows = owned_attempts($db, 'a.id = ?', [$id]);
    if (!$rows) fail('Attempt not found.', 404);
    return $rows[0];
}

function h_attempts_get(PDO $db): void
{
    admin_guard();
    sweep_stale_attempts($db);
    $id = int_in('id');
    $a = load_owned_attempt($db, $id);
    if ($a['status'] === 'terminated' && !$a['admin_seen']) $db->prepare('UPDATE attempts SET admin_seen = 1 WHERE id = ?')->execute([$id]);

    $st = $db->prepare('SELECT q.*, f.fkey AS figure FROM questions q LEFT JOIN figures f ON f.id = q.figure_id
                        WHERE q.quiz_id = ? ORDER BY q.sort_order, q.id');
    $st->execute([$a['quiz_id']]);
    $questions = $st->fetchAll();
    $choices = [];
    if ($questions) {
        $in = implode(',', array_map('intval', array_column($questions, 'id')));
        foreach ($db->query("SELECT * FROM choices WHERE question_id IN ($in) ORDER BY sort_order, id") as $c) {
            $choices[(int)$c['question_id']][(int)$c['id']] = $c;
        }
    }
    $st = $db->prepare('SELECT * FROM attempt_answers WHERE attempt_id = ?');
    $st->execute([$id]);
    $answers = [];
    foreach ($st->fetchAll() as $r) $answers[(int)$r['question_id']] = $r;

    $items = [];
    foreach ($questions as $q) {
        $qid = (int)$q['id'];
        $ans = $answers[$qid] ?? null;
        $given = $ans['answer'] ?? null;
        if ($q['type'] === 'mcq') {
            $givenText = $given !== null && isset($choices[$qid][(int)$given]) ? $choices[$qid][(int)$given]['choice_text'] : null;
            $correctText = implode(' / ', array_map(fn($c) => $c['choice_text'], array_filter($choices[$qid] ?? [], fn($c) => $c['is_correct'])));
        } elseif ($q['type'] === 'tf') {
            $givenText = $given === null ? null : ($given === 'false' ? 'False' : 'True');
            $correctText = $q['answer_text'] === 'false' ? 'False' : 'True';
        } else {
            $givenText = $given;
            $correctText = implode(' / ', accepted_answers($q['answer_text']));
        }
        $items[] = [
            'id' => $qid,
            'type' => $q['type'],
            'question' => $q['question'],
            'figure' => $q['figure'],
            'points' => fmt_num($q['points']),
            'earned' => fmt_num($ans['points'] ?? 0),
            'state' => $ans === null || $givenText === null || $givenText === '' ? 'blank' : ($ans['is_correct'] ? 'right' : 'wrong'),
            'given' => $givenText,
            'correct' => $correctText,
        ];
    }
    $row = attempt_row($a);
    $row['answered'] = count(array_filter($items, fn($i) => $i['state'] !== 'blank'));
    out(['attempt' => $row, 'answers' => $items]);
}

function h_attempts_delete(PDO $db): void
{
    admin_guard();
    $a = load_owned_attempt($db, int_in('id'));
    $db->prepare('DELETE FROM attempts WHERE id = ?')->execute([$a['id']]);
    out([]);
}
