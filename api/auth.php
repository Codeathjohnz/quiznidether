<?php
/* ===================== TEACHER ACCOUNTS / AUTH ===================== */

function uid(): int
{
    return (int)($_SESSION['admin_id'] ?? 0);
}

function scalar(PDO $db, string $sql, array $params = []): int
{
    $st = $db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
}

function account_count(PDO $db): int
{
    return (int)$db->query('SELECT COUNT(*) FROM admins')->fetchColumn();
}

function find_admin(PDO $db, string $col, $val): ?array
{
    if (!in_array($col, ['id', 'email', 'username', 'google_sub'], true)) return null;
    $st = $db->prepare("SELECT * FROM admins WHERE $col = ?");
    $st->execute([$val]);
    return $st->fetch() ?: null;
}

function user_payload(array $a): array
{
    return [
        'id' => (int)$a['id'],
        'name' => $a['name'] ?: ($a['username'] ?: $a['email']),
        'email' => $a['email'],
        'username' => $a['username'],
        'avatar' => $a['avatar_url'],
        'has_password' => !empty($a['password_hash']),
        'google_linked' => !empty($a['google_sub']),
    ];
}

function login_as(PDO $db, array $admin): void
{
    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int)$admin['id'];
    $db->prepare('UPDATE admins SET last_login_at = ? WHERE id = ?')->execute([now(), $admin['id']]);
}

function current_admin(PDO $db): ?array
{
    return uid() ? find_admin($db, 'id', uid()) : null;
}

function clean_email(string $e): string
{
    return strtolower(trim($e));
}

function check_email(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) fail('Please enter a valid email address.');
    $allowed = array_filter(array_map(fn($d) => strtolower(trim($d)), explode(',', ALLOWED_EMAIL_DOMAINS)));
    if ($allowed && !in_array(substr(strrchr($email, '@'), 1), $allowed, true)) {
        fail('Only these email addresses can be used: @' . implode(', @', $allowed));
    }
}

function check_signup_allowed(PDO $db): void
{
    if (!ALLOW_SIGNUP && account_count($db) > 0) fail('New sign-ups are turned off. Ask the administrator for an account.', 403);
}

function create_account(PDO $db, string $name, string $email, ?string $hash, ?string $googleSub = null, ?string $avatar = null): array
{
    $db->prepare('INSERT INTO admins (name, email, password_hash, google_sub, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)')
       ->execute([mb_substr($name, 0, 120), $email, $hash, $googleSub, $avatar, now()]);
    $id = (int)$db->lastInsertId();
    // The very first teacher adopts classes that existed before accounts were added.
    if (account_count($db) === 1) $db->prepare('UPDATE classes SET owner_id = ? WHERE owner_id IS NULL')->execute([$id]);
    return find_admin($db, 'id', $id);
}

function http_get(string $url): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 8]);
        $r = curl_exec($ch);
        curl_close($ch);
        return $r === false ? null : $r;
    }
    $r = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 12, 'ignore_errors' => true]]));
    return $r === false ? null : $r;
}

/** Verifies a Google ID token (from "Sign in with Google") with Google and returns its claims. */
function verify_google_token(string $jwt): array
{
    if (GOOGLE_CLIENT_ID === '') fail('Google sign-in is not set up yet. Set GOOGLE_CLIENT_ID (Dokploy Environment, or includes/config.php on XAMPP).');
    if ($jwt === '' || substr_count($jwt, '.') !== 2) fail('Google sign-in failed. Please try again.', 401);
    $body = http_get('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($jwt));
    if ($body === null) fail('Could not reach Google to verify your sign-in. Check the server\'s internet connection and try again.');
    $t = json_decode($body, true);
    if (!is_array($t) || isset($t['error']) || isset($t['error_description'])) fail('Google sign-in failed: the sign-in token is invalid.', 401);
    if (($t['aud'] ?? '') !== GOOGLE_CLIENT_ID) fail('Google sign-in failed: the token was issued for a different app.', 401);
    if (!in_array($t['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) fail('Google sign-in failed: wrong issuer.', 401);
    if ((int)($t['exp'] ?? 0) < time()) fail('Google sign-in expired. Please try again.', 401);
    if (!in_array($t['email_verified'] ?? '', [true, 'true'], true)) fail('Your Google email address is not verified.', 401);
    if (empty($t['sub']) || empty($t['email'])) fail('Google did not share your email address.', 401);
    return $t;
}

function h_auth_status(PDO $db): void
{
    $me = current_admin($db);
    if (!$me) unset($_SESSION['admin_id']);
    $count = account_count($db);
    out([
        'user' => $me ? user_payload($me) : null,
        'hasAccounts' => $count > 0,
        'allowSignup' => ALLOW_SIGNUP || $count === 0,
        'googleClientId' => GOOGLE_CLIENT_ID,
        'allowedDomains' => ALLOWED_EMAIL_DOMAINS,
        'autoPassing' => AUTO_PASSING_PERCENT,
    ]);
}

function h_auth_signup(PDO $db): void
{
    require_xhr();
    check_signup_allowed($db);
    $in = input();
    $name = preg_replace('/\s+/u', ' ', str_in('name'));
    $email = clean_email(str_in('email'));
    $pw = (string)($in['password'] ?? '');
    if (mb_strlen($name) < 2) fail('Please enter your name.');
    check_email($email);
    if (strlen($pw) < 6) fail('Password must be at least 6 characters.');
    if ($pw !== (string)($in['confirm'] ?? '')) fail('Passwords do not match.');
    if (find_admin($db, 'email', $email)) fail('An account with this email already exists. Please log in instead.');
    $admin = create_account($db, $name, $email, password_hash($pw, PASSWORD_DEFAULT));
    login_as($db, $admin);
    out(['user' => user_payload($admin)]);
}

function h_auth_login(PDO $db): void
{
    require_xhr();
    $id = str_in('email');
    $pw = (string)(input()['password'] ?? '');
    $admin = find_admin($db, 'email', clean_email($id)) ?? find_admin($db, 'username', $id);
    if (!$admin || empty($admin['password_hash'])) {
        if ($admin && $admin['google_sub']) fail('This account uses Google sign-in. Click "Continue with Google".', 401);
        fail('Wrong email or password.', 401);
    }
    if (!password_verify($pw, $admin['password_hash'])) fail('Wrong email or password.', 401);
    login_as($db, $admin);
    out(['user' => user_payload($admin)]);
}

/** Google sign-in: logs in, links Google to an existing account, or signs up a new teacher. */
function h_auth_google(PDO $db): void
{
    require_xhr();
    $t = verify_google_token(str_in('credential'));
    $sub = (string)$t['sub'];
    $email = clean_email((string)$t['email']);
    $name = trim((string)($t['name'] ?? '')) ?: strstr($email, '@', true);
    $avatar = isset($t['picture']) ? mb_substr((string)$t['picture'], 0, 500) : null;

    // Linking Google from the Account page while logged in.
    if ($me = current_admin($db)) {
        $other = find_admin($db, 'google_sub', $sub);
        if ($other && (int)$other['id'] !== (int)$me['id']) fail('This Google account is already used by another teacher account.');
        $emailFree = !find_admin($db, 'email', $email);
        $db->prepare('UPDATE admins SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?), email = COALESCE(email, ?) WHERE id = ?')
           ->execute([$sub, $avatar, $emailFree ? $email : null, $me['id']]);
        out(['user' => user_payload(find_admin($db, 'id', $me['id'])), 'linked' => true]);
    }

    $admin = find_admin($db, 'google_sub', $sub);
    if (!$admin && ($admin = find_admin($db, 'email', $email))) {
        // Same email signed up with a password before: link Google to it.
        $db->prepare('UPDATE admins SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')->execute([$sub, $avatar, $admin['id']]);
        $admin = find_admin($db, 'id', $admin['id']);
    }
    $created = false;
    if (!$admin) {
        check_signup_allowed($db);
        check_email($email);
        $admin = create_account($db, $name, $email, null, $sub, $avatar);
        $created = true;
    } elseif ($avatar && $avatar !== $admin['avatar_url']) {
        $db->prepare('UPDATE admins SET avatar_url = ? WHERE id = ?')->execute([$avatar, $admin['id']]);
        $admin['avatar_url'] = $avatar;
    }
    login_as($db, $admin);
    out(['user' => user_payload($admin), 'created' => $created]);
}

function h_auth_unlink_google(PDO $db): void
{
    admin_guard();
    $me = current_admin($db);
    if (empty($me['password_hash'])) fail('Set a password first, otherwise you would not be able to log in anymore.');
    $db->prepare('UPDATE admins SET google_sub = NULL WHERE id = ?')->execute([$me['id']]);
    out(['user' => user_payload(find_admin($db, 'id', $me['id']))]);
}

function h_auth_logout(PDO $db): void
{
    $_SESSION = [];
    session_destroy();
    out([]);
}

function h_auth_account(PDO $db): void
{
    admin_guard();
    $me = current_admin($db);
    $in = input();
    $name = preg_replace('/\s+/u', ' ', str_in('name'));
    $email = clean_email(str_in('email'));
    $new = (string)($in['new'] ?? '');
    if ($me['password_hash'] && !password_verify((string)($in['current'] ?? ''), $me['password_hash'])) fail('Current password is incorrect.');
    if (mb_strlen($name) < 2) fail('Please enter your name.');
    check_email($email);
    if ($new !== '' && strlen($new) < 6) fail('New password must be at least 6 characters.');
    if ($new !== (string)($in['confirm'] ?? '')) fail('New passwords do not match.');
    $other = find_admin($db, 'email', $email);
    if ($other && (int)$other['id'] !== (int)$me['id']) fail('That email is already used by another account.');
    $db->prepare('UPDATE admins SET name = ?, email = ?, password_hash = ? WHERE id = ?')
       ->execute([$name, $email, $new !== '' ? password_hash($new, PASSWORD_DEFAULT) : $me['password_hash'], $me['id']]);
    out(['user' => user_payload(find_admin($db, 'id', $me['id']))]);
}
