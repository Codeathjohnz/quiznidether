<?php
/*
 * Questionnaire (TQ) import.
 *
 * Understands the Quiz ni Dether template and common test-questionnaire styles:
 *
 *   TEST I. MULTIPLE CHOICE              <- optional section heading (sets the default type)
 *   1. What does CPU stand for?          <- question: number + . or )
 *   A. Central Processing Unit           <- choices: letter + . or )   (a trailing * also marks the answer)
 *   B. Computer Personal Unit
 *   ANSWER: A                            <- answer: letter, True/False (Tama/Mali), or text (alternatives with |)
 *   POINTS: 2                            <- optional, default 1
 *   TYPE: Identification                 <- optional, otherwise detected automatically
 *
 *   ANSWER KEY                           <- optional: answers at the end instead of ANSWER: lines
 *   1. A
 *   2. True
 *   3. Charles Babbage | Babbage
 */

const IMPORT_MAX_CHARS = 400000;
const IMPORT_MAX_QUESTIONS = 500;

function import_type_from(string $s): ?string
{
    $s = strtolower($s);
    if (preg_match('/true\s*(or|\/|-|&)?\s*false|\btf\b|tama\s*(o|or)?\s*mali|modified\s+true/', $s)) return 'tf';
    if (preg_match('/multiple\s*choice|\bmcq?\b|multiple-choice|choose\s+the/', $s)) return 'mcq';
    if (preg_match('/identification|fill\s*(in)?\s*(the)?\s*blank|short\s*answer|\btext\b|enumerat|completion/', $s)) return 'text';
    return null;
}

/** "30", "30s", "45 sec", "1 min", "1.5 minutes", "2h", "1:30" -> [seconds, unit] or null */
function import_duration(string $s): ?array
{
    $s = strtolower(trim($s, " \t."));
    if (preg_match('/^(\d+):([0-5]\d)$/', $s, $m)) {
        return [(int)$m[1] * 60 + (int)$m[2], 'seconds'];
    }
    if (!preg_match('/^(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)?$/', $s, $m)) return null;
    $u = $m[2] ?? 's';
    $unit = $u[0] === 'h' ? 'hours' : ($u[0] === 'm' ? 'minutes' : 'seconds');
    return [(int)round((float)$m[1] * TIME_UNITS[$unit]), $unit];
}

function import_tf(string $s): ?string
{
    $s = strtolower(trim($s, " \t.*"));
    if (in_array($s, ['true', 't', 'tama', 'yes', 'correct'], true)) return 'true';
    if (in_array($s, ['false', 'f', 'mali', 'no', 'wrong'], true)) return 'false';
    return null;
}

function parse_questionnaire(string $text): array
{
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    $lines = preg_split('/\r\n|\r|\n/', $text);
    $questions = [];
    $errors = [];
    $warnings = [];
    $cur = null;          // index into $questions
    $sectionType = null;  // default type from a "TEST II. TRUE OR FALSE" heading
    $keyMode = false;
    $ignored = 0;

    $isHeading = function (string $l): bool {
        if (preg_match('/^(part|test|section|exam|quiz)\b/i', $l) && import_type_from($l)) return true;   // "Test II - True or False"
        if (preg_match('/^[IVX]+\s*[.)\-–—:]\s*\S/', $l) && import_type_from($l)) return true;            // "II. TRUE OR FALSE"
        if (strlen($l) < 60 && import_type_from($l) && !preg_match('/^(\d+\s*[.)]|[a-h]\s*[.)]|(answer|ans|type|points?)\s*[:\-=])/i', $l)
            && $l === strtoupper($l)) return true;                                                           // "IDENTIFICATION"
        return false;
    };

    foreach ($lines as $i => $raw) {
        $n = $i + 1;
        $l = trim(preg_replace('/[\x{00A0}\x{2007}\x{202F}\t]+/u', ' ', $raw));
        $l = preg_replace('/^[*_]{1,2}(.*?)[*_]{1,2}$/u', '$1', $l);          // strip **markdown bold**
        $l = trim(preg_replace('/^#{1,6}\s+/', '', $l, 1, $hashes));       // "## Test I" markdown headings
        if ($l === '' || (!$hashes && preg_match('/^(#|\/\/|---+$|===+$)/', $l))) continue;

        // ----- answer key section -----
        if (preg_match('/^(answer\s*key|key\s*to\s*correction|answers?\s*:?\s*$|susi\s*sa\s*pagwawasto)/i', $l)) {
            $keyMode = true;
            $cur = null;
            continue;
        }
        if ($keyMode) {
            if ($isHeading($l) || preg_match('/^(part|test|section)?\s*([IVX]+|\d+)?\s*[.:\-–—)]?\s*$/i', $l)
                || preg_match('/^(part|test|section)\s+([ivx]+|\d+)\b/i', $l)) continue;   // "Test II", "II.", "Part 3"
            $pairs = [];
            if (preg_match_all('/(\d+)\s*[.)\-:=]\s*([A-Ha-h]|true|false|tama|mali|t|f)\b(?=\s*(?:[,;]|\s\d+\s*[.)\-:=]|$))/i', $l, $m, PREG_SET_ORDER) >= 2) {
                foreach ($m as $mm) $pairs[] = [(int)$mm[1], trim($mm[2])];
            } elseif (preg_match('/^(\d+)\s*[.)\-:=]\s*(.+)$/', $l, $mm)) {
                $pairs[] = [(int)$mm[1], trim($mm[2])];
            } else {
                $warnings[] = ['line' => $n, 'message' => 'Answer key line not understood: "' . mb_substr($l, 0, 60) . '"'];
                continue;
            }
            foreach ($pairs as [$num, $ans]) {
                // First question with this number that has no answer yet (handles numbering that restarts per test).
                $target = null;
                foreach ($questions as $qi => $q) {
                    if ($q['num'] === $num && $q['answer'] === null) { $target = $qi; break; }
                }
                if ($target === null) {
                    $warnings[] = ['line' => $n, 'message' => "Answer key has an answer for item $num, but there is no unanswered item $num."];
                } else {
                    $questions[$target]['answer'] = $ans;
                    $questions[$target]['answer_line'] = $n;
                }
            }
            continue;
        }

        // ----- section headings -----
        if ($isHeading($l)) {
            $sectionType = import_type_from($l);
            $cur = null;
            continue;
        }

        // ----- question start -----
        if (preg_match('/^(?:q(?:uestion)?\s*)?(\d+)\s*[.)](?!\d)\s*(.+)$/i', $l, $m)) {
            if (count($questions) >= IMPORT_MAX_QUESTIONS) {
                $errors[] = ['line' => $n, 'message' => 'Too many questions (maximum ' . IMPORT_MAX_QUESTIONS . ').'];
                break;
            }
            $questions[] = [
                'num' => (int)$m[1], 'line' => $n, 'text' => trim($m[2]), 'choices' => [], 'answer' => null, 'answer_line' => null,
                'type' => null, 'section_type' => $sectionType, 'points' => 1.0, 'time' => null, 'time_line' => null,
            ];
            $cur = count($questions) - 1;
            continue;
        }

        if ($cur === null) {
            $ignored++;
            continue; // text before the first question (title, instructions, AI chatter)
        }
        $q = &$questions[$cur];

        if (preg_match('/^(?:correct\s*)?(?:answer|ans|sagot)\s*[:\-=]\s*(.+)$/i', $l, $m)) {
            $q['answer'] = trim($m[1]);
            $q['answer_line'] = $n;
        } elseif (preg_match('/^type\s*[:\-=]\s*(.+)$/i', $l, $m)) {
            $t = import_type_from($m[1]);
            if ($t) $q['type'] = $t;
            else $warnings[] = ['line' => $n, 'message' => 'Unknown TYPE "' . $m[1] . '" (use Multiple Choice, True or False, or Identification).'];
        } elseif (preg_match('/^(?:points?|pts?|score)\s*[:\-=]\s*([\d.]+)/i', $l, $m)) {
            $q['points'] = (float)$m[1];
        } elseif (preg_match('/^(?:time|timer|time\s*limit)\s*[:\-=]\s*(.+)$/i', $l, $m)) {
            $q['time'] = import_duration($m[1]) ?? false;
            $q['time_line'] = $n;
        } elseif (preg_match('/^\(?([A-Ha-h])\s*[.)]\s*(.+)$/', $l, $m) && ($q['choices'] || strtolower($m[1]) === 'a')) {
            $txt = trim($m[2]);
            $star = (bool)preg_match('/\s*(\*|\(correct\)|✓|✔)\s*$/u', $txt);
            if ($star) $txt = trim(preg_replace('/\s*(\*|\(correct\)|✓|✔)\s*$/u', '', $txt));
            $q['choices'][] = ['letter' => strtoupper($m[1]), 'text' => $txt, 'star' => $star];
        } elseif ($q['choices']) {
            $q['choices'][count($q['choices']) - 1]['text'] .= ' ' . $l;   // wrapped choice
        } else {
            $q['text'] .= "\n" . $l;                                       // multi-line question
        }
        unset($q);
    }

    // ----- finalize -----
    $out = [];
    foreach ($questions as $q) {
        $label = 'Item ' . $q['num'] . ' (line ' . $q['line'] . ')';
        $err = function (string $msg) use (&$errors, $q, $label) { $errors[] = ['line' => $q['line'], 'message' => "$label: $msg"]; };
        $answer = $q['answer'] !== null ? trim($q['answer']) : null;
        $stars = array_values(array_filter($q['choices'], fn($c) => $c['star']));
        $type = $q['type'] ?? (count($q['choices']) >= 2 ? 'mcq' : null);
        if (!$type) {
            if ($answer !== null && import_tf($answer) !== null && !in_array($q['section_type'], ['mcq', 'text'], true)) $type = 'tf';
            else $type = $q['section_type'] === 'tf' ? 'tf' : 'text';
        }
        $item = ['num' => $q['num'], 'line' => $q['line'], 'type' => $type, 'question' => trim($q['text']), 'points' => $q['points'],
                 'choices' => [], 'tf_answer' => null, 'accepted' => [],
                 'time_seconds' => $q['time'] ? $q['time'][0] : null, 'time_unit' => $q['time'] ? $q['time'][1] : null,
                 'time_label' => $q['time'] ? fmt_timer($q['time'][0]) : null];
        if ($item['points'] <= 0 || $item['points'] > 1000) { $err('POINTS must be greater than 0.'); continue; }
        if ($q['time'] === false) { $err('TIME must look like "30 sec", "1 min" or "1:30".'); continue; }
        if ($q['time'] && ($q['time'][0] < 5 || $q['time'][0] > 86400)) { $err('TIME must be between 5 seconds and 24 hours.'); continue; }
        if (mb_strlen($item['question']) > 10000) { $err('question is too long.'); continue; }

        if ($type === 'mcq') {
            if (count($q['choices']) < 2) { $err('multiple choice needs at least 2 choices (A., B., …).'); continue; }
            $correct = [];
            if ($answer !== null && $answer !== '') {
                foreach (preg_split('/\s*(?:,|&|\band\b|\/)\s*/i', $answer) as $part) {
                    $part = trim($part, " .)(*");
                    if (preg_match('/^[A-Ha-h]$/', $part)) {
                        $correct[] = strtoupper($part);
                    } elseif (preg_match('/^([A-Ha-h])\s*[.)]\s*(.+)$/', $part, $m)) {
                        $correct[] = strtoupper($m[1]);                                    // "B. Bird"
                    } else {
                        foreach ($q['choices'] as $c) {
                            if (normalize_answer($c['text']) === normalize_answer($part)) $correct[] = $c['letter'];
                        }
                    }
                }
            }
            foreach ($stars as $c) $correct[] = $c['letter'];
            $correct = array_unique($correct);
            $letters = array_column($q['choices'], 'letter');
            if (!$correct) { $err($answer === null ? 'no answer. Add "ANSWER: B" or an ANSWER KEY entry.' : 'answer "' . $answer . '" does not match any choice letter.'); continue; }
            if (array_diff($correct, $letters)) { $err('answer "' . implode(', ', $correct) . '" is not one of the choices (' . implode(', ', $letters) . ').'); continue; }
            foreach ($q['choices'] as $c) $item['choices'][] = ['text' => mb_substr($c['text'], 0, 2000), 'correct' => in_array($c['letter'], $correct, true)];
        } elseif ($type === 'tf') {
            $tf = $answer !== null ? import_tf($answer) : null;
            if ($tf === null) { $err($answer === null ? 'no answer. Add "ANSWER: True" or "ANSWER: False".' : 'answer must be True or False (got "' . $answer . '").'); continue; }
            $item['tf_answer'] = $tf;
        } else {
            $acc = array_values(array_filter(array_map('trim', preg_split('/\s*[|;]\s*/', (string)$answer)), fn($x) => $x !== ''));
            if (!$acc) { $err('no answer. Add "ANSWER: your answer" (separate other accepted answers with |).'); continue; }
            $item['accepted'] = $acc;
        }
        $out[] = $item;
    }
    if ($ignored && $questions) {
        $warnings[] = ['line' => 0, 'message' => "$ignored line(s) before the first question were ignored (titles, instructions, notes)."];
    }
    return ['questions' => $out, 'errors' => $errors, 'warnings' => $warnings, 'found' => count($questions)];
}

function h_questions_import(PDO $db): void
{
    admin_guard();
    $quizId = int_in('quiz_id');
    load_quiz($db, $quizId);
    $text = (string)(input()['text'] ?? '');
    if (trim($text) === '') fail('Paste your questionnaire or choose a file first.');
    if (strlen($text) > IMPORT_MAX_CHARS) fail('The file is too big (maximum about 400 KB of text).');

    $parsed = parse_questionnaire($text);
    if (!$parsed['found']) {
        fail('No questions found. Each question must start with a number, like "1. What is a computer?". Download the template to see the format.');
    }
    if (!bool_in('commit')) out($parsed + ['imported' => 0]);   // preview only

    if (!$parsed['questions']) fail('Nothing to import — fix the errors first.');
    $replace = str_in('mode') === 'replace';

    $db->beginTransaction();
    if ($replace) $db->prepare('DELETE FROM questions WHERE quiz_id = ?')->execute([$quizId]);
    $order = scalar($db, 'SELECT COALESCE(MAX(sort_order), 0) FROM questions WHERE quiz_id = ?', [$quizId]);
    $insQ = $db->prepare('INSERT INTO questions (quiz_id, type, question, answer_text, points, time_seconds, time_unit, sort_order)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $insC = $db->prepare('INSERT INTO choices (question_id, choice_text, is_correct, sort_order) VALUES (?, ?, ?, ?)');
    foreach ($parsed['questions'] as $q) {
        $answerText = $q['type'] === 'tf' ? $q['tf_answer'] : ($q['type'] === 'text' ? implode("\n", $q['accepted']) : null);
        $insQ->execute([$quizId, $q['type'], $q['question'], $answerText, $q['points'], $q['time_seconds'], $q['time_unit'], ++$order]);
        $qid = (int)$db->lastInsertId();
        foreach ($q['choices'] as $ci => $c) $insC->execute([$qid, $c['text'], $c['correct'] ? 1 : 0, $ci]);
    }
    $db->commit();
    regrade_quiz($db, $quizId);
    out($parsed + ['imported' => count($parsed['questions']), 'replaced' => $replace]);
}
