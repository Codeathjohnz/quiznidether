<?php
/* ===================== VISITS, REVIEWS AND THE DEVELOPER DASHBOARD ===================== */

const REVIEW_STATUSES = ['new', 'read', 'done'];

/** Developers are the emails in DEVELOPER_EMAILS, or (when empty) the very first account. */
function is_developer(PDO $db, ?array $admin): bool
{
    if (!$admin) return false;
    $list = array_filter(array_map(fn($e) => strtolower(trim($e)), explode(',', DEVELOPER_EMAILS)));
    if ($list) return in_array(strtolower((string)$admin['email']), $list, true);
    return (int)$admin['id'] === (int)$db->query('SELECT MIN(id) FROM admins')->fetchColumn();
}

function dev_guard(PDO $db): void
{
    admin_guard();
    if (!is_developer($db, current_admin($db))) fail('Only the developer can open this page.', 403);
}

/** Teachers must leave a review once they have made their first quiz/exam (the developer is not asked). */
function review_needed(PDO $db, array $admin): bool
{
    if (is_developer($db, $admin)) return false;
    if (scalar($db, 'SELECT COUNT(*) FROM reviews WHERE admin_id = ?', [$admin['id']])) return false;
    return scalar($db, 'SELECT COUNT(*) FROM quizzes q JOIN classes c ON c.id = q.class_id WHERE c.owner_id = ?', [$admin['id']]) > 0;
}

function review_input(): array
{
    $rating = int_in('rating');
    $comment = trim(preg_replace('/[ \t]+/u', ' ', str_in('comment', 2000)));
    $suggestion = trim(preg_replace('/[ \t]+/u', ' ', str_in('suggestion', 2000)));
    if ($rating < 1 || $rating > 5) fail('Please choose 1 to 5 stars.');
    if (mb_strlen($comment) < 3) fail('Please write a short comment about the system.');
    return [$rating, $comment, $suggestion !== '' ? $suggestion : null];
}

function review_row(array $r): array
{
    return [
        'id' => (int)$r['id'],
        'role' => $r['role'],
        'name' => $r['name'],
        'detail' => $r['detail'],
        'rating' => (int)$r['rating'],
        'comment' => $r['comment'],
        'suggestion' => $r['suggestion'],
        'status' => $r['status'],
        'created_at' => $r['created_at'],
        'updated_at' => $r['updated_at'],
    ];
}

/* ---------- visits ---------- */

function device_of(string $ua): string
{
    if (preg_match('/iPad|Tablet|Android(?!.*Mobile)/i', $ua)) return 'tablet';
    if (preg_match('/Mobi|iPhone|Android/i', $ua)) return 'phone';
    return 'computer';
}

/** Records a page visit. The same browser opening the same area again within 30 minutes counts once. */
function h_track_visit(PDO $db): void
{
    $area = str_in('area');
    $vid = str_in('vid');
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if (!in_array($area, ['login', 'teacher', 'student'], true) || !preg_match('/^[a-z0-9]{16,64}$/', $vid)) out(['tracked' => false]);
    if ($ua === '' || preg_match('/bot|crawl|spider|preview|curl|wget|headless/i', $ua)) out(['tracked' => false]);

    $visitor = sha1('qnd|' . $vid);
    $recent = scalar($db, 'SELECT COUNT(*) FROM visits WHERE visitor = ? AND area = ? AND visited_at > ?',
        [$visitor, $area, date('Y-m-d H:i:s', time() - 1800)]);
    if ($recent) out(['tracked' => false]);

    $path = mb_substr(preg_replace('/[^\w\/\-]/', '', str_in('path')), 0, 190) ?: null;
    $db->prepare('INSERT INTO visits (visitor, area, path, admin_id, device, visited_at) VALUES (?, ?, ?, ?, ?, ?)')
       ->execute([$visitor, $area, $path, uid() ?: null, device_of($ua), now()]);
    out(['tracked' => true]);
}

/* ---------- reviews (teachers) ---------- */

function h_review_mine(PDO $db): void
{
    admin_guard();
    $st = $db->prepare('SELECT * FROM reviews WHERE admin_id = ?');
    $st->execute([uid()]);
    $r = $st->fetch();
    out(['review' => $r ? review_row($r) : null, 'needed' => review_needed($db, current_admin($db))]);
}

function h_review_save(PDO $db): void
{
    admin_guard();
    [$rating, $comment, $suggestion] = review_input();
    $me = current_admin($db);
    $name = $me['name'] ?: ($me['email'] ?: 'Teacher');
    $st = $db->prepare('SELECT id FROM reviews WHERE admin_id = ?');
    $st->execute([$me['id']]);
    if ($id = $st->fetchColumn()) {
        // An edited review shows up as new again on the developer dashboard.
        $db->prepare("UPDATE reviews SET name = ?, detail = ?, rating = ?, comment = ?, suggestion = ?, status = 'new', updated_at = ? WHERE id = ?")
           ->execute([$name, $me['email'], $rating, $comment, $suggestion, now(), $id]);
    } else {
        $db->prepare("INSERT INTO reviews (role, admin_id, name, detail, rating, comment, suggestion, created_at, updated_at)
                      VALUES ('teacher', ?, ?, ?, ?, ?, ?, ?, ?)")
           ->execute([$me['id'], $name, $me['email'], $rating, $comment, $suggestion, now(), now()]);
        $id = (int)$db->lastInsertId();
    }
    $st = $db->prepare('SELECT * FROM reviews WHERE id = ?');
    $st->execute([$id]);
    out(['review' => review_row($st->fetch())]);
}

/* ---------- reviews (students, after finishing a quiz/exam) ---------- */

function h_take_review(PDO $db): void
{
    $a = load_attempt($db);
    if ($a['status'] === 'in_progress') fail('Finish the quiz/exam first.');
    [$rating, $comment, $suggestion] = review_input();
    $title = scalar_str($db, 'SELECT title FROM quizzes WHERE id = ?', [$a['quiz_id']]);
    $detail = mb_substr($a['section'] . ' · ' . $title, 0, 190);
    $db->prepare("INSERT INTO reviews (role, attempt_id, name, detail, rating, comment, suggestion, created_at, updated_at)
                  VALUES ('student', ?, ?, ?, ?, ?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), suggestion = VALUES(suggestion),
                                          status = 'new', updated_at = VALUES(updated_at)")
       ->execute([$a['id'], $a['full_name'], $detail, $rating, $comment, $suggestion, now(), now()]);
    out(['saved' => true]);
}

function scalar_str(PDO $db, string $sql, array $params = []): string
{
    $st = $db->prepare($sql);
    $st->execute($params);
    return (string)$st->fetchColumn();
}

/* ---------- developer dashboard ---------- */

function h_dev_overview(PDO $db): void
{
    dev_guard($db);
    $today = date('Y-m-d 00:00:00');
    $since = fn(int $days) => date('Y-m-d 00:00:00', strtotime("-$days days"));
    $count = fn(string $from, bool $unique) => scalar($db,
        'SELECT ' . ($unique ? 'COUNT(DISTINCT visitor)' : 'COUNT(*)') . ' FROM visits WHERE visited_at >= ?', [$from]);

    $visits = [
        'today' => $count($today, false), 'today_unique' => $count($today, true),
        'week' => $count($since(6), false), 'week_unique' => $count($since(6), true),
        'month' => $count($since(29), false), 'month_unique' => $count($since(29), true),
        'total' => (int)$db->query('SELECT COUNT(*) FROM visits')->fetchColumn(),
        'total_unique' => (int)$db->query('SELECT COUNT(DISTINCT visitor) FROM visits')->fetchColumn(),
    ];

    // Visits per day for the last 14 days (days without visits included as 0).
    $st = $db->prepare('SELECT DATE(visited_at) d, COUNT(*) n, COUNT(DISTINCT visitor) u FROM visits WHERE visited_at >= ? GROUP BY DATE(visited_at)');
    $st->execute([$since(13)]);
    $byDay = [];
    foreach ($st as $r) $byDay[$r['d']] = $r;
    $daily = [];
    for ($i = 13; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-$i days"));
        $daily[] = ['date' => $d, 'visits' => (int)($byDay[$d]['n'] ?? 0), 'unique' => (int)($byDay[$d]['u'] ?? 0)];
    }

    $group = function (string $col) use ($db, $since) {
        $st = $db->prepare("SELECT $col k, COUNT(*) n FROM visits WHERE visited_at >= ? GROUP BY $col ORDER BY n DESC");
        $st->execute([$since(29)]);
        $res = [];
        foreach ($st as $r) $res[$r['k']] = (int)$r['n'];
        return $res;
    };

    $users = [
        'teachers' => account_count($db),
        'new_week' => scalar($db, 'SELECT COUNT(*) FROM admins WHERE created_at >= ?', [$since(6)]),
        'active_week' => scalar($db, 'SELECT COUNT(*) FROM admins WHERE last_login_at >= ?', [$since(6)]),
        'google' => (int)$db->query('SELECT COUNT(*) FROM admins WHERE google_sub IS NOT NULL')->fetchColumn(),
        'classes' => (int)$db->query('SELECT COUNT(*) FROM classes')->fetchColumn(),
        'quizzes' => (int)$db->query('SELECT COUNT(*) FROM quizzes')->fetchColumn(),
        'attempts' => (int)$db->query('SELECT COUNT(*) FROM attempts')->fetchColumn(),
        'attempts_week' => scalar($db, 'SELECT COUNT(*) FROM attempts WHERE started_at >= ?', [$since(6)]),
        'students' => (int)$db->query('SELECT COUNT(DISTINCT LOWER(full_name), LOWER(section)) FROM attempts')->fetchColumn(),
    ];

    $rv = $db->query("SELECT COUNT(*) n, AVG(rating) avg, SUM(status = 'new') fresh, SUM(role = 'teacher') teachers,
                             SUM(role = 'student') students, SUM(suggestion IS NOT NULL) suggestions FROM reviews")->fetch();
    $stars = array_fill(1, 5, 0);
    foreach ($db->query('SELECT rating, COUNT(*) n FROM reviews GROUP BY rating') as $r) $stars[(int)$r['rating']] = (int)$r['n'];
    $latest = array_map('review_row', $db->query('SELECT * FROM reviews ORDER BY updated_at DESC LIMIT 5')->fetchAll());

    out([
        'visits' => $visits,
        'daily' => $daily,
        'areas' => $group('area'),
        'devices' => $group('device'),
        'users' => $users,
        'reviews' => [
            'count' => (int)$rv['n'],
            'average' => $rv['n'] ? round((float)$rv['avg'], 1) : null,
            'new' => (int)$rv['fresh'],
            'teachers' => (int)$rv['teachers'],
            'students' => (int)$rv['students'],
            'suggestions' => (int)$rv['suggestions'],
            'stars' => $stars,
            'latest' => $latest,
        ],
    ]);
}

function h_dev_users(PDO $db): void
{
    dev_guard($db);
    $rows = $db->query("SELECT a.id, a.name, a.email, a.avatar_url, a.created_at, a.last_login_at,
               a.google_sub IS NOT NULL AS google, a.password_hash IS NOT NULL AS has_password,
               (SELECT COUNT(*) FROM classes c WHERE c.owner_id = a.id) AS classes,
               (SELECT COUNT(*) FROM quizzes q JOIN classes c ON c.id = q.class_id WHERE c.owner_id = a.id) AS quizzes,
               (SELECT COUNT(*) FROM attempts t JOIN quizzes q ON q.id = t.quiz_id JOIN classes c ON c.id = q.class_id WHERE c.owner_id = a.id) AS attempts,
               (SELECT COUNT(*) FROM visits v WHERE v.admin_id = a.id) AS visits,
               r.rating
        FROM admins a LEFT JOIN reviews r ON r.admin_id = a.id
        ORDER BY a.created_at DESC")->fetchAll();
    $dev = current_admin($db);
    out(['users' => array_map(fn($r) => [
        'id' => (int)$r['id'],
        'name' => $r['name'] ?: $r['email'],
        'email' => $r['email'],
        'avatar' => $r['avatar_url'],
        'created_at' => $r['created_at'],
        'last_login_at' => $r['last_login_at'],
        'login' => $r['google'] && $r['has_password'] ? 'Google + password' : ($r['google'] ? 'Google' : 'Password'),
        'classes' => (int)$r['classes'],
        'quizzes' => (int)$r['quizzes'],
        'attempts' => (int)$r['attempts'],
        'visits' => (int)$r['visits'],
        'rating' => $r['rating'] !== null ? (int)$r['rating'] : null,
        'is_me' => (int)$r['id'] === (int)$dev['id'],
    ], $rows)]);
}

function h_dev_reviews(PDO $db): void
{
    dev_guard($db);
    $where = [];
    $params = [];
    $role = str_in('role');
    if (in_array($role, ['teacher', 'student'], true)) { $where[] = 'role = ?'; $params[] = $role; }
    $status = str_in('status');
    if (in_array($status, REVIEW_STATUSES, true)) { $where[] = 'status = ?'; $params[] = $status; }
    if (bool_in('with_suggestion')) $where[] = 'suggestion IS NOT NULL';
    if ($q = str_in('q', 100)) {
        $where[] = '(name LIKE ? OR comment LIKE ? OR suggestion LIKE ? OR detail LIKE ?)';
        array_push($params, "%$q%", "%$q%", "%$q%", "%$q%");
    }
    $st = $db->prepare('SELECT * FROM reviews' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY updated_at DESC LIMIT 500');
    $st->execute($params);
    out(['reviews' => array_map('review_row', $st->fetchAll())]);
}

function h_dev_review_status(PDO $db): void
{
    dev_guard($db);
    $status = str_in('status');
    if (!in_array($status, REVIEW_STATUSES, true)) fail('Unknown status.');
    $db->prepare('UPDATE reviews SET status = ? WHERE id = ?')->execute([$status, int_in('id')]);
    out([]);
}

function h_dev_review_delete(PDO $db): void
{
    dev_guard($db);
    $db->prepare('DELETE FROM reviews WHERE id = ?')->execute([int_in('id')]);
    out([]);
}
