<?php
// ===================================================================
// ping.php – Zero Ledger: freiwillige Installations-Pings (nur nach Einwilligung in der App)
// ===================================================================
// POST (JSON, auch als text/plain ohne Vorab-Anfrage):
//   Nutzer (freiwillig, in der App): { id, art: "neu"|"bestehend"|"lebt", version, sprache, instanz, nutzer? (#52) }  → { status: "ok" }
//   Instanz (Betreiber, serverseitig, #9): { art: "instanz", version, instanz }  → { status: "ok" }
// GET ?summen → { status, installationen, neu, bestehend, aktiv_30_tage, version: {…}, sprache: {…},
//                 instanzen, instanzen_aktiv_30_tage, nutzer_je_instanz: { "<instanz>": aktive Installationen 30 Tage, unter 5 als "<5" },
//                 nutzer_dieses_fenster, nutzer_letztes_fenster (#52), stand }
// Beide Zählungen sind getrennt: Instanz-Pings (instanzen.json) zählen nie als Installation und umgekehrt.
//
// Offen für alle Instanzen (CORS *, nur dieser Endpunkt). Gespeichert wird je Installations-Nummer nur der letzte
// Stand (erste Art, erstes/letztes Datum, Version, Sprache, Instanz) – keine IP, kein Protokoll einzelner Pings.
// Die IP zählt nur als stündliche Prüfsumme in der Bremse (wie die übrigen Endpunkte) und verfällt nach 2 Stunden.
// Einträge ohne Lebenszeichen seit 12 Monaten werden gelöscht. Abschalten: OL_PING in _instanz.php oder
// „ping_annehmen“ => false in config.php.
// ===================================================================
declare(strict_types=1);
require __DIR__ . '/_instanz.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');

const PING_MAX_BYTES = 1024;
const PING_PRO_STUNDE = 30;
const PING_VERFALL = 365 * 86400;

function aus(array $d, int $code = 200): never {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$methode = $_SERVER['REQUEST_METHOD'] ?? '';
if ($methode === 'OPTIONS') { http_response_code(204); exit; }
if (!ol_ping_an()) aus(['status' => 'aus'], 404);

$ordner = ol_datenordner() . '/ping';
if (!is_dir($ordner) && !@mkdir($ordner, 0750, true)) aus(['status' => 'fehler'], 500);
$datei = $ordner . '/installationen.json';
$dateiInstanzen = $ordner . '/instanzen.json';  // #9: Instanz-Pings getrennt

function lesen(string $datei): array {
    $t = is_readable($datei) ? (string)file_get_contents($datei) : '';
    $d = $t !== '' ? json_decode($t, true) : [];
    return is_array($d) ? $d : [];
}

// ---------- Summen (öffentlich) ----------
if ($methode === 'GET') {
    if (!isset($_GET['summen'])) aus(['status' => 'fehler', 'meldung' => 'Nur ?summen.'], 400);
    header('Cache-Control: public, max-age=300');
    $alle = lesen($datei);
    $s = ['status' => 'ok', 'installationen' => 0, 'neu' => 0, 'bestehend' => 0, 'aktiv_30_tage' => 0, 'version' => [], 'sprache' => [], 'stand' => gmdate('c')];
    $grenze = time() - 30 * 86400;
    foreach ($alle as $e) {
        $s['installationen']++;
        if (($e['art'] ?? '') === 'bestehend') $s['bestehend']++; else $s['neu']++;
        if (($e['zuletzt'] ?? 0) >= $grenze) $s['aktiv_30_tage']++;
        $v = (string)($e['version'] ?? '?'); $s['version'][$v] = ($s['version'][$v] ?? 0) + 1;
        $l = (string)($e['sprache'] ?? '?'); $s['sprache'][$l] = ($s['sprache'][$l] ?? 0) + 1;
    }
    // #9: aktive Nutzer-Installationen je Instanz (nur Summen) und die Instanzen selbst, getrennt gezählt
    $je = [];
    foreach ($alle as $e) if (($e['zuletzt'] ?? 0) >= $grenze) { $i = (string)($e['instanz'] ?? '?'); $je[$i] = ($je[$i] ?? 0) + 1; }
    $inst = lesen($dateiInstanzen);
    $s['instanzen'] = count($inst);
    $s['instanzen_aktiv_30_tage'] = count(array_filter($inst, fn($e) => ($e['zuletzt'] ?? 0) >= $grenze));
    ksort($je); foreach ($je as $k => $n) if ($n < 5) $je[$k] = '<5';  // #9: kleine Instanzen nicht genau ausweisen
    $s['nutzer_je_instanz'] = (object)$je;
    // #52: Nutzer statt Geräte – verschiedene Hashes je 7-Tage-Fenster (gleiches Fenster wie in der App); Installationen ohne Hash zählen einzeln
    $f = intdiv(time(), 7 * 86400);
    foreach (['nutzer_dieses_fenster' => $f, 'nutzer_letztes_fenster' => $f - 1] as $feld => $fw) {
        $h = []; $ohne = 0;
        foreach ($alle as $e) {
            if (!empty($e['nh'][(string)$fw])) $h[$e['nh'][(string)$fw]] = true;
            elseif (empty($e['nh']) && intdiv((int)($e['zuletzt'] ?? 0), 7 * 86400) === $fw) $ohne++;
        }
        $s[$feld] = count($h) + $ohne;
    }
    ksort($s['version']); ksort($s['sprache']); $s['version'] = (object)$s['version']; $s['sprache'] = (object)$s['sprache'];
    aus($s);
}
if ($methode !== 'POST') aus(['status' => 'fehler'], 405);

// ---------- Bremse je IP-Hash und Stunde (Datei verfällt nach 2 Stunden; die IP selbst wird nicht gespeichert) ----------
$zdir = ol_datenordner() . '/zaehler';
if (is_dir($zdir) || @mkdir($zdir, 0750, true)) {
    $f = $zdir . '/p-' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . gmdate('YmdH')) . '.txt';
    $n = (int)@file_get_contents($f) + 1;
    @file_put_contents($f, (string)$n, LOCK_EX);
    if (random_int(1, 50) === 1) foreach (glob($zdir . '/p-*.txt') ?: [] as $alt) if (filemtime($alt) < time() - 7200) @unlink($alt);
    if ($n > PING_PRO_STUNDE) aus(['status' => 'limit'], 429);
}

// ---------- Eingabe prüfen ----------
$roh = file_get_contents('php://input', false, null, 0, PING_MAX_BYTES + 1) ?: '';
if (strlen($roh) > PING_MAX_BYTES) aus(['status' => 'abgelehnt'], 413);
$in = json_decode($roh, true);
if (!is_array($in)) aus(['status' => 'abgelehnt'], 400);
$id = (string)($in['id'] ?? '');
$art = (string)($in['art'] ?? '');
// #9: Instanz-Ping des Betreibers – ohne Nummer, Schlüssel ist die Instanz-Adresse; nur Version und Datum
if ($art === 'instanz') {
    $instanz = strtolower((string)($in['instanz'] ?? '')); $version = (string)($in['version'] ?? '');
    if (strlen($instanz) > 100 || !preg_match('#^[a-z0-9.-]+(:\d{1,5})?(/[a-z0-9._~/-]*)?$#', $instanz) || !preg_match('/^v?\d{1,3}(\.\d{1,3}){0,2}$/', $version)) aus(['status' => 'abgelehnt'], 400);
    $fh = fopen($dateiInstanzen, 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) aus(['status' => 'fehler'], 500);
    $t = stream_get_contents($fh); $inst = $t ? (json_decode($t, true) ?: []) : []; $jetzt = time();
    if (!isset($inst[$instanz]) && count($inst) >= 20000) { flock($fh, LOCK_UN); fclose($fh); aus(['status' => 'voll'], 507); }
    $e = $inst[$instanz] ?? ['erst' => $jetzt]; $e['zuletzt'] = $jetzt; $e['version'] = $version; $inst[$instanz] = $e;
    if (random_int(1, 100) === 1) foreach ($inst as $k => $x) if (($x['zuletzt'] ?? 0) < $jetzt - PING_VERFALL) unset($inst[$k]);
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($inst, JSON_UNESCAPED_SLASHES)); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    aus(['status' => 'ok']);
}
$version = (string)($in['version'] ?? '');
$sprache = (string)($in['sprache'] ?? '');
$instanz = strtolower((string)($in['instanz'] ?? ''));
$nutzer = (string)($in['nutzer'] ?? '');  // #52: optional, Hash aus Nutzer-Kennung + 7-Tage-Fenster (wechselt alle 7 Tage)
if (!preg_match('/^[a-z0-9]{16,40}$/', $id)
    || !in_array($art, ['neu', 'bestehend', 'lebt'], true)
    || !preg_match('/^v?\d{1,3}(\.\d{1,3}){0,2}$/', $version)
    || !preg_match('/^[a-z]{2}$/', $sprache)
    || ($nutzer !== '' && !preg_match('/^[a-f0-9]{32}$/', $nutzer))
    || strlen($instanz) > 100 || !preg_match('#^[a-z0-9.-]+(:\d{1,5})?(/[a-z0-9._~/-]*)?$#', $instanz)) {
    aus(['status' => 'abgelehnt'], 400);
}

// ---------- Speichern: letzter Stand je Nummer, unter Sperre ----------
$fh = fopen($datei, 'c+');
if (!$fh || !flock($fh, LOCK_EX)) aus(['status' => 'fehler'], 500);
$t = stream_get_contents($fh);
$alle = $t ? (json_decode($t, true) ?: []) : [];
$jetzt = time();
if (!isset($alle[$id]) && count($alle) >= 200000) { flock($fh, LOCK_UN); fclose($fh); aus(['status' => 'voll'], 507); }
$e = $alle[$id] ?? ['art' => $art === 'lebt' ? 'neu' : $art, 'erst' => $jetzt];
$e['zuletzt'] = $jetzt; $e['version'] = $version; $e['sprache'] = $sprache; $e['instanz'] = $instanz;
if ($nutzer !== '') {  // #52: Hash je 7-Tage-Fenster, nur die letzten zwei Fenster behalten
    $fw = intdiv($jetzt, 7 * 86400); $nh = array_filter((array)($e['nh'] ?? []), fn($k) => (int)$k >= $fw - 1, ARRAY_FILTER_USE_KEY);
    $nh[(string)$fw] = $nutzer; $e['nh'] = $nh;
} else unset($e['nh']);
$alle[$id] = $e;
if (random_int(1, 100) === 1) foreach ($alle as $k => $x) if (($x['zuletzt'] ?? 0) < $jetzt - PING_VERFALL) unset($alle[$k]);
ftruncate($fh, 0); rewind($fh);
fwrite($fh, json_encode($alle, JSON_UNESCAPED_SLASHES));
fflush($fh); flock($fh, LOCK_UN); fclose($fh);
aus(['status' => 'ok']);
