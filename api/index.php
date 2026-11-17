<?php
/*
 * Quiz ni Dether — JSON API used by the React app.
 * Call as: api/index.php?action=<name>  (POST JSON body, or form data for sendBeacon)
 */
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/admin.php';
require __DIR__ . '/import.php';
require __DIR__ . '/student.php';
require __DIR__ . '/dev.php';
require __DIR__ . '/figures.php';

// Pictures of questions are served as images, not JSON.
if (($_GET['action'] ?? '') === 'figure') {
    try {
        h_figure_get(db());
    } catch (Throwable $e) {
        http_response_code(500);
        exit;
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$routes = [
    // auth
    'auth.status'      => 'h_auth_status',
    'auth.signup'      => 'h_auth_signup',
    'auth.login'       => 'h_auth_login',
    'auth.google'      => 'h_auth_google',
    'auth.unlink_google' => 'h_auth_unlink_google',
    'auth.logout'      => 'h_auth_logout',
    'auth.account'     => 'h_auth_account',
    'auth.tour_done'   => 'h_auth_tour_done',
    // visits, reviews, developer dashboard
    'track.visit'      => 'h_track_visit',
    'review.mine'      => 'h_review_mine',
    'review.save'      => 'h_review_save',
    'dev.overview'     => 'h_dev_overview',
    'dev.users'        => 'h_dev_users',
    'dev.reviews'      => 'h_dev_reviews',
    'dev.review_status' => 'h_dev_review_status',
    'dev.review_delete' => 'h_dev_review_delete',
    // admin
    'nav'              => 'h_nav',
    'dashboard'        => 'h_dashboard',
    'classes.list'     => 'h_classes_list',
    'classes.save'     => 'h_classes_save',
    'classes.delete'   => 'h_classes_delete',
    'quizzes.list'     => 'h_quizzes_list',
    'quizzes.form'     => 'h_quizzes_form',
    'quizzes.save'     => 'h_quizzes_save',
    'quizzes.delete'   => 'h_quizzes_delete',
    'quizzes.toggle'   => 'h_quizzes_toggle',
    'quizzes.regen'    => 'h_quizzes_regen',
    'questions.list'   => 'h_questions_list',
    'questions.save'   => 'h_questions_save',
    'questions.delete' => 'h_questions_delete',
    'questions.move'   => 'h_questions_move',
    'questions.import' => 'h_questions_import',
    'figures.upload'   => 'h_figures_upload',
    'results.list'     => 'h_results_list',
    'results.export'   => 'h_results_export',
    'results.regrade'  => 'h_results_regrade',
    'attempts.get'     => 'h_attempts_get',
    'attempts.delete'  => 'h_attempts_delete',
    // student
    'take.info'        => 'h_take_info',
    'take.start'       => 'h_take_start',
    'take.save'        => 'h_take_save',
    'take.next'        => 'h_take_next',
    'take.heartbeat'   => 'h_take_heartbeat',
    'take.status'      => 'h_take_status',
    'take.submit'      => 'h_take_submit',
    'take.terminate'   => 'h_take_terminate',
    'take.review'      => 'h_take_review',
];

$action = (string)($_GET['action'] ?? '');
try {
    if (!isset($routes[$action])) fail('Unknown action.', 404);
    $routes[$action](db());
} catch (Throwable $e) {
    fail($e instanceof RuntimeException ? $e->getMessage() : 'Server error: ' . $e->getMessage(), 500);
}
