<?php
/*
 * Figures: a picture or diagram shown with a question (graph, shape, map, circuit, photo...).
 *
 *  - Teachers upload PNG / JPG / GIF / WEBP pictures, or SVG drawings (an AI can write these as text).
 *  - Stored in the database (table figures) so they survive redeploys of the app.
 *  - Served at api/index.php?action=figure&k=<key>. The key is long and random, so students can load it
 *    without logging in, but nobody can guess other figures.
 *  - SVG is cleaned (no scripts, links or outside files) and is always shown with <img>, where browsers
 *    never run scripts anyway.
 */

const FIGURE_MAX_BYTES = 900000;     // fits the default MySQL packet size of XAMPP (1 MB)
const FIGURE_SVG_MAX_BYTES = 300000;
const FIGURE_RASTER = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Safe drawing elements of SVG (no script, foreignObject, image, iframe, animation or links). */
const SVG_ELEMENTS = [
    'svg', 'g', 'defs', 'title', 'desc', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'marker', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'style',
];

/** Cleans an SVG drawing. Returns the safe SVG text, or null if it is not a readable SVG. */
function svg_clean(string $svg): ?string
{
    $svg = trim($svg);
    $svg = preg_replace('/^```\w*\s*|\s*```$/', '', $svg);
    $start = stripos($svg, '<svg');
    $end = strripos($svg, '</svg>');
    if ($start === false || $end === false || $end < $start) return null;
    $svg = substr($svg, $start, $end - $start + 6);
    if (strlen($svg) > FIGURE_SVG_MAX_BYTES) return null;
    if (preg_match('/<!DOCTYPE|<!ENTITY/i', $svg)) return null;          // no XML entity tricks
    if (!preg_match('/\sxmlns\s*=/', substr($svg, 0, strpos($svg, '>') ?: 0))) {
        $svg = preg_replace('/^<svg\b/i', '<svg xmlns="http://www.w3.org/2000/svg"', $svg, 1);
    }
    // AI drawings often use HTML entities that XML does not know.
    $svg = strtr($svg, ['&nbsp;' => '&#160;', '&deg;' => '&#176;', '&times;' => '&#215;', '&minus;' => '&#8722;',
                        '&pi;' => '&#960;', '&theta;' => '&#952;', '&alpha;' => '&#945;', '&beta;' => '&#946;', '&le;' => '&#8804;',
                        '&ge;' => '&#8805;', '&ne;' => '&#8800;', '&radic;' => '&#8730;', '&sup2;' => '&#178;', '&sup3;' => '&#179;',
                        '&frac12;' => '&#189;', '&middot;' => '&#183;', '&rarr;' => '&#8594;', '&larr;' => '&#8592;', '&harr;' => '&#8596;']);

    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $ok = $doc->loadXML($svg, LIBXML_NONET | LIBXML_COMPACT);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if (!$ok || !$doc->documentElement || strtolower($doc->documentElement->localName) !== 'svg') return null;

    $clean = function (DOMElement $el) use (&$clean) {
        foreach (iterator_to_array($el->childNodes) as $child) {
            if ($child instanceof DOMElement) {
                $name = strtolower($child->localName);
                if ($name === 'a' || $name === 'switch') {                      // keep what is inside a link
                    $clean($child);
                    while ($child->firstChild) $el->insertBefore($child->firstChild, $child);
                    $el->removeChild($child);
                    continue;
                }
                if (!in_array($name, SVG_ELEMENTS, true)) { $el->removeChild($child); continue; }
                $clean($child);
            } elseif ($child instanceof DOMProcessingInstruction || $child instanceof DOMComment) {
                $el->removeChild($child);
            }
        }
        foreach (iterator_to_array($el->attributes) as $attr) {
            $n = strtolower($attr->nodeName);
            $v = trim($attr->nodeValue);
            preg_match_all('/url\s*\(\s*[\'"]?(.?)/i', $v, $urls);
            $bad = str_starts_with($n, 'on')
                || (preg_match('/(^|:)href$/', $n) && !str_starts_with($v, '#'))
                || preg_match('/javascript:|data:|expression\s*\(|@import/i', $v)
                || array_diff($urls[1], ['#']);                                // only url(#id) inside the drawing
            if ($bad) $el->removeAttributeNode($attr);
        }
        if (strtolower($el->localName) === 'style') {
            $css = $el->textContent;
            if (preg_match('/@import|javascript:|expression\s*\(|url\s*\(\s*[\'"]?(?!#)/i', $css)) $el->parentNode->removeChild($el);
        }
    };
    $root = $doc->documentElement;
    $clean($root);

    // Make it scale: a drawing with only width/height gets a viewBox.
    if (!$root->hasAttribute('viewBox')) {
        $w = (float)$root->getAttribute('width');
        $h = (float)$root->getAttribute('height');
        if ($w > 0 && $h > 0) $root->setAttribute('viewBox', "0 0 $w $h");
    }
    $out = $doc->saveXML($root);
    return $out !== false && strlen($out) <= FIGURE_SVG_MAX_BYTES ? $out : null;
}

/**
 * Reads a picture sent as a data URL (data:image/png;base64,...) or SVG text.
 * Returns ['mime' => ..., 'bytes' => ...] or ['error' => message].
 */
function figure_decode(string $value): array
{
    $value = trim($value);
    if ($value === '') return ['error' => 'The picture is empty.'];
    if (stripos($value, '<svg') !== false && !str_starts_with($value, 'data:')) {
        $svg = svg_clean($value);
        return $svg === null ? ['error' => 'The SVG drawing could not be read (check that it starts with <svg and ends with </svg>).']
                             : ['mime' => 'image/svg+xml', 'bytes' => $svg];
    }
    if (!preg_match('#^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$#', $value, $m)) {
        return ['error' => 'Unsupported picture. Use PNG, JPG, GIF, WEBP or SVG.'];
    }
    $bytes = base64_decode(preg_replace('/\s+/', '', $m[2]), true);
    if ($bytes === false || $bytes === '') return ['error' => 'The picture could not be read.'];
    if (strtolower($m[1]) === 'image/svg+xml') return figure_decode($bytes);
    if (strlen($bytes) > FIGURE_MAX_BYTES) return ['error' => 'The picture is too big (maximum 900 KB). Use a smaller picture.'];
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info['mime'], FIGURE_RASTER, true)) return ['error' => 'Unsupported picture. Use PNG, JPG, GIF, WEBP or SVG.'];
    return ['mime' => $info['mime'], 'bytes' => $bytes];
}

/** Saves a decoded figure; returns ['id' => ..., 'key' => ...]. */
function figure_store(PDO $db, array $fig): array
{
    $key = random_code(24);
    $db->prepare('INSERT INTO figures (fkey, owner_id, mime, bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
       ->execute([$key, (int)($_SESSION['admin_id'] ?? 0) ?: null, $fig['mime'], strlen($fig['bytes']), $fig['bytes'], now()]);
    return ['id' => (int)$db->lastInsertId(), 'key' => $key];
}

/** Figure id of a key owned by the logged-in teacher (0 = none / not found). */
function figure_id_of(PDO $db, string $key): int
{
    if (!preg_match('/^[a-z0-9]{24}$/', $key)) return 0;
    return (int)scalar($db, 'SELECT id FROM figures WHERE fkey = ? AND (owner_id = ? OR owner_id IS NULL)', [$key, (int)$_SESSION['admin_id']]);
}

/** Removes this teacher's uploaded figures that no question uses anymore (older than a day). */
function figure_cleanup(PDO $db): void
{
    $db->prepare('DELETE f FROM figures f LEFT JOIN questions q ON q.figure_id = f.id
                  WHERE f.owner_id = ? AND f.created_at < ? AND q.id IS NULL')
       ->execute([(int)$_SESSION['admin_id'], date('Y-m-d H:i:s', time() - 86400)]);
}

/** POST figures.upload {data: "data:image/png;base64,..." | "<svg ...>"} -> {key, mime} */
function h_figures_upload(PDO $db): void
{
    admin_guard();
    $raw = input()['data'] ?? '';
    if (!is_string($raw)) fail('The picture could not be read.');
    $fig = figure_decode($raw);
    if (isset($fig['error'])) fail($fig['error']);
    figure_cleanup($db);
    $saved = figure_store($db, $fig);
    out(['key' => $saved['key'], 'mime' => $fig['mime']]);
}

/** GET api/index.php?action=figure&k=<key> — the picture itself (cached by the browser). */
function h_figure_get(PDO $db): void
{
    $key = (string)($_GET['k'] ?? '');
    $row = null;
    if (preg_match('/^[a-z0-9]{24}$/', $key)) {
        $st = $db->prepare('SELECT mime, data FROM figures WHERE fkey = ?');
        $st->execute([$key]);
        $row = $st->fetch();
    }
    header_remove('Pragma');
    header_remove('Expires');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
    if (!$row) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        echo 'Figure not found.';
        exit;
    }
    header('Content-Type: ' . $row['mime']);
    header('Cache-Control: public, max-age=31536000, immutable');   // a key never changes its picture
    header('Content-Length: ' . strlen($row['data']));
    echo $row['data'];
    exit;
}
