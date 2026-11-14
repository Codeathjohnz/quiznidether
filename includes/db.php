<?php
function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    } catch (PDOException $e) {
        $pdo = null;
        error_log('Quiz ni Dether DB connection failed: ' . $e->getMessage());
        throw new RuntimeException(getenv('DB_HOST') !== false
            ? 'Database connection failed. Check the DB_* environment variables of the app.'
            : 'Database connection failed. Start MySQL in the XAMPP Control Panel and check includes/config.php. (' . $e->getMessage() . ')');
    }

    try {
        // Works on XAMPP (root). On a hosted database the database already exists and this may be denied.
        $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    } catch (PDOException $e) {
        // ignore: the USE below reports a real problem
    }
    $pdo->exec('USE `' . DB_NAME . '`');

    if (!$pdo->query("SHOW TABLES LIKE 'attempt_answers'")->fetch()) {
        // Serialize first-time setup so simultaneous requests don't create tables twice.
        $pdo->query("SELECT GET_LOCK('qnd_install', 30)");
        try {
            if (!$pdo->query("SHOW TABLES LIKE 'attempt_answers'")->fetch()) install_schema($pdo);
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('qnd_install')");
        }
    }
    migrate_schema($pdo);
    return $pdo;
}

/** Upgrades databases created by older versions (single admin -> teacher accounts with email/Google). */
function migrate_schema(PDO $pdo): void
{
    $hasCol = fn(string $table, string $col) => (bool)$pdo->query("SHOW COLUMNS FROM `$table` LIKE '$col'")->fetch();
    if ($hasCol('admins', 'email') && $hasCol('quizzes', 'time_unit') && $hasCol('quizzes', 'timer_mode')) return;
    $pdo->query("SELECT GET_LOCK('qnd_migrate', 30)");
    try {
        // v4: per-question timer (one question at a time, each with its own countdown).
        if (!$hasCol('quizzes', 'timer_mode') && $hasCol('quizzes', 'time_unit')) {
            $pdo->exec("ALTER TABLE quizzes ADD timer_mode ENUM('whole','per_question') NOT NULL DEFAULT 'whole' AFTER time_unit");
            $pdo->exec("ALTER TABLE questions ADD time_seconds INT NULL AFTER points,
                        ADD time_unit ENUM('seconds','minutes','hours') NULL AFTER time_seconds");
            $pdo->exec('ALTER TABLE attempts ADD current_index INT NOT NULL DEFAULT 0 AFTER question_order,
                        ADD question_started_at DATETIME NULL AFTER current_index');
        }
        // v3: timers stored in seconds + the unit the teacher picked (old versions stored minutes).
        if (!$hasCol('quizzes', 'time_unit')) {
            $pdo->exec("ALTER TABLE classes CHANGE default_time_limit default_time_seconds INT NOT NULL DEFAULT 1800,
                        ADD default_time_unit ENUM('seconds','minutes','hours') NOT NULL DEFAULT 'minutes' AFTER default_time_seconds");
            $pdo->exec('UPDATE classes SET default_time_seconds = default_time_seconds * 60');
            $pdo->exec("ALTER TABLE quizzes CHANGE time_limit time_seconds INT NOT NULL DEFAULT 1800,
                        ADD time_unit ENUM('seconds','minutes','hours') NOT NULL DEFAULT 'minutes' AFTER time_seconds");
            $pdo->exec('UPDATE quizzes SET time_seconds = time_seconds * 60');
        }
        // v2: teacher accounts with email / Google.
        if (!$hasCol('admins', 'email')) {
            $pdo->exec("ALTER TABLE admins
                MODIFY username VARCHAR(60) NULL,
                MODIFY password_hash VARCHAR(255) NULL,
                ADD name VARCHAR(120) NOT NULL DEFAULT '' AFTER username,
                ADD email VARCHAR(190) NULL UNIQUE AFTER name,
                ADD google_sub VARCHAR(64) NULL UNIQUE AFTER password_hash,
                ADD avatar_url VARCHAR(500) NULL AFTER google_sub,
                ADD last_login_at DATETIME NULL AFTER avatar_url");
            $pdo->exec("UPDATE admins SET name = username WHERE name = ''");
        }
        if (!$pdo->query("SHOW COLUMNS FROM classes LIKE 'owner_id'")->fetch()) {
            $pdo->exec('ALTER TABLE classes ADD owner_id INT NULL AFTER id, ADD INDEX idx_class_owner (owner_id)');
            // Existing classes belong to the original admin.
            $first = $pdo->query('SELECT MIN(id) FROM admins')->fetchColumn();
            if ($first) $pdo->prepare('UPDATE classes SET owner_id = ?')->execute([$first]);
        }
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('qnd_migrate')");
    }
}

function install_schema(PDO $pdo): void
{
    $sql = [
        "CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(60) NULL UNIQUE,
            name VARCHAR(120) NOT NULL DEFAULT '',
            email VARCHAR(190) NULL UNIQUE,
            password_hash VARCHAR(255) NULL,
            google_sub VARCHAR(64) NULL UNIQUE,
            avatar_url VARCHAR(500) NULL,
            last_login_at DATETIME NULL,
            created_at DATETIME NOT NULL
        ) ENGINE=InnoDB",

        "CREATE TABLE IF NOT EXISTS classes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NULL,
            INDEX idx_class_owner (owner_id),
            name VARCHAR(150) NOT NULL,
            description TEXT NULL,
            default_time_seconds INT NOT NULL DEFAULT 1800,
            default_time_unit ENUM('seconds','minutes','hours') NOT NULL DEFAULT 'minutes',
            created_at DATETIME NOT NULL
        ) ENGINE=InnoDB",

        "CREATE TABLE IF NOT EXISTS quizzes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            instructions TEXT NULL,
            time_seconds INT NOT NULL DEFAULT 1800,
            time_unit ENUM('seconds','minutes','hours') NOT NULL DEFAULT 'minutes',
            timer_mode ENUM('whole','per_question') NOT NULL DEFAULT 'whole',
            passing_mode ENUM('auto','manual') NOT NULL DEFAULT 'auto',
            passing_score DECIMAL(5,2) NOT NULL DEFAULT 75,
            shuffle_questions TINYINT(1) NOT NULL DEFAULT 0,
            show_result TINYINT(1) NOT NULL DEFAULT 1,
            is_open TINYINT(1) NOT NULL DEFAULT 1,
            link_code VARCHAR(32) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            CONSTRAINT fk_quiz_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB",

        "CREATE TABLE IF NOT EXISTS questions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            quiz_id INT NOT NULL,
            type ENUM('mcq','tf','text') NOT NULL DEFAULT 'mcq',
            question TEXT NOT NULL,
            answer_text TEXT NULL,
            points DECIMAL(6,2) NOT NULL DEFAULT 1,
            time_seconds INT NULL,
            time_unit ENUM('seconds','minutes','hours') NULL,
            sort_order INT NOT NULL DEFAULT 0,
            CONSTRAINT fk_question_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB",

        "CREATE TABLE IF NOT EXISTS choices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question_id INT NOT NULL,
            choice_text TEXT NOT NULL,
            is_correct TINYINT(1) NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 0,
            CONSTRAINT fk_choice_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB",

        "CREATE TABLE IF NOT EXISTS attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            quiz_id INT NOT NULL,
            token CHAR(48) NOT NULL UNIQUE,
            full_name VARCHAR(150) NOT NULL,
            section VARCHAR(100) NOT NULL,
            status ENUM('in_progress','submitted','terminated') NOT NULL DEFAULT 'in_progress',
            submit_note VARCHAR(255) NULL,
            termination_reason VARCHAR(40) NULL,
            termination_detail TEXT NULL,
            client_note VARCHAR(255) NULL,
            question_order TEXT NULL,
            current_index INT NOT NULL DEFAULT 0,
            question_started_at DATETIME NULL,
            started_at DATETIME NOT NULL,
            deadline DATETIME NOT NULL,
            last_seen DATETIME NOT NULL,
            finished_at DATETIME NULL,
            score DECIMAL(8,2) NOT NULL DEFAULT 0,
            total_points DECIMAL(8,2) NOT NULL DEFAULT 0,
            percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
            ip VARCHAR(45) NULL,
            user_agent VARCHAR(255) NULL,
            admin_seen TINYINT(1) NOT NULL DEFAULT 0,
            INDEX idx_attempt_quiz (quiz_id),
            INDEX idx_attempt_status (status),
            CONSTRAINT fk_attempt_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB",

        "CREATE TABLE IF NOT EXISTS attempt_answers (
            attempt_id INT NOT NULL,
            question_id INT NOT NULL,
            answer TEXT NULL,
            is_correct TINYINT(1) NOT NULL DEFAULT 0,
            points DECIMAL(6,2) NOT NULL DEFAULT 0,
            answered_at DATETIME NOT NULL,
            PRIMARY KEY (attempt_id, question_id),
            CONSTRAINT fk_answer_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
            CONSTRAINT fk_answer_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB",
    ];
    foreach ($sql as $s) $pdo->exec($s);
}
