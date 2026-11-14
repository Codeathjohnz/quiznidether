<?php
/*
 * Quiz ni Dether — configuration
 *
 * Every setting can come from an environment variable (used on the VPS / Dokploy).
 * When a variable is not set, the value after it is used (the XAMPP defaults on this PC).
 */
function env_value(string $name, $default)
{
    $v = getenv($name);
    if ($v === false || $v === '') return $default;
    if (is_bool($default)) return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    if (is_int($default)) return (int)$v;
    return $v;
}

// Database (XAMPP default: root with no password)
define('DB_HOST', env_value('DB_HOST', '127.0.0.1'));
define('DB_PORT', env_value('DB_PORT', 3306));
define('DB_USER', env_value('DB_USER', 'root'));
define('DB_PASS', env_value('DB_PASS', ''));
define('DB_NAME', env_value('DB_NAME', 'quiz_ni_dether'));

/*
 * ---------- Teacher accounts ----------
 * Sign in with Google (Gmail):
 *   1. Go to https://console.cloud.google.com/apis/credentials  (create a project if asked)
 *   2. "Create credentials" -> "OAuth client ID" -> Application type: "Web application"
 *   3. Under "Authorized JavaScript origins" add your site, e.g. https://quiz.yourdomain.com
 *      (and http://localhost for XAMPP, http://localhost:5173 for npm run dev)
 *   4. Put the Client ID in GOOGLE_CLIENT_ID (looks like 1234-abc.apps.googleusercontent.com)
 * Leave it empty to hide the Google button (email + password sign-up still works).
 */
define('GOOGLE_CLIENT_ID', env_value('GOOGLE_CLIENT_ID', '344500915745-8578k3jia40euqp7le3q0d89d2em4ekt.apps.googleusercontent.com'));

// Allow new teachers to create accounts from the login page.
define('ALLOW_SIGNUP', env_value('ALLOW_SIGNUP', true));

// Only allow these email domains to sign up, comma separated (e.g. 'gmail.com,myschool.edu.ph'). Empty = any.
define('ALLOWED_EMAIL_DOMAINS', env_value('ALLOWED_EMAIL_DOMAINS', ''));

/*
 * Developer accounts: can open the Developer dashboard (visits, users, reviews and suggestions).
 * Comma-separated emails, e.g. 'me@gmail.com'. Empty = the very first account created is the developer.
 */
define('DEVELOPER_EMAILS', env_value('DEVELOPER_EMAILS', 'olaguirdetherjohn@gmail.com,detherjohnolaguir@gmail.com'));

// Passing percentage used when a quiz's passing mode is set to "Automatic".
define('AUTO_PASSING_PERCENT', env_value('AUTO_PASSING_PERCENT', 75));

// If a student's browser stops responding for this many seconds while taking a quiz,
// the attempt is terminated (covers force-closing the browser / killing the app).
define('HEARTBEAT_TIMEOUT', env_value('HEARTBEAT_TIMEOUT', 45));

// Extra seconds accepted after the timer ends (network delay).
define('SUBMIT_GRACE_SECONDS', env_value('SUBMIT_GRACE_SECONDS', 60));

date_default_timezone_set(env_value('APP_TIMEZONE', 'Asia/Manila'));
