<?php
// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// dav.php – WebDAV-Durchleitung für den Speicher-Konnektor (europäische Speicher)
// ===================================================================
// Browser dürfen Nextcloud, HiDrive & Co. meist nicht direkt ansprechen (CORS).
// Diese Datei leitet genau eine Anfrage weiter und speichert NICHTS (keine Zugangsdaten, keine Inhalte).
//
// POST { url, user, pass, methode: "GET"|"PUT"|"MKCOL"|"PROPFIND", inhalt? }
//   → { status: "ok"|"fehler"|"abgelehnt", code, inhalt? }
// Schutz: nur erlaubte Herkunft (api/_instanz.php), nur https, keine internen Adressen, nur der Ordner KOMPASS
// und Dateien kompass-*.json darin, höchstens 3 MB, keine Weiterleitungen, Bremse je IP.
// ===================================================================
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/_instanz.php';
define('PRIVAT_CFG', ol_konfig_pfad());
define('PRIVAT_KOMPASS', ol_datenordner());
const MAX_BYTES = 3 * 1024 * 1024;

function aus(array $d, int $code = 200): never {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function nein(string $warum, int $code = 400): never { aus(['status' => 'abgelehnt', 'antwort' => $warum], $code); }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') aus(['status' => 'fehler'], 405);
$cfg = is_readable(PRIVAT_CFG) ? (include PRIVAT_CFG) : [];
$origin = rtrim((string)($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
$erlaubt = ol_erlaubte_herkunft(is_array($cfg) ? $cfg : []);
if ($origin === '' || !in_array($origin, $erlaubt, true)) nein('Herkunft nicht erlaubt.', 403);

// Bremse: höchstens 240 Anfragen je IP-Hash und Stunde
$dir = PRIVAT_KOMPASS . '/zaehler';
if (is_dir($dir) || @mkdir($dir, 0750, true)) {
    $f = $dir . '/d-' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . gmdate('YmdH')) . '.txt';
    $n = (int)@file_get_contents($f) + 1;
    @file_put_contents($f, (string)$n, LOCK_EX);
    if ($n > 240) nein('Zu viele Anfragen. Bitte später noch einmal.', 429);
}

$roh = file_get_contents('php://input') ?: '';
if (strlen($roh) > MAX_BYTES + 4096) nein('Zu groß.', 413);
$in = json_decode($roh, true);
if (!is_array($in)) aus(['status' => 'fehler'], 400);

$url = trim((string)($in['url'] ?? ''));
$user = (string)($in['user'] ?? '');
$pass = (string)($in['pass'] ?? '');
$methode = strtoupper((string)($in['methode'] ?? 'GET'));
if (!in_array($methode, ['GET', 'PUT', 'MKCOL', 'PROPFIND'], true)) nein('Methode nicht erlaubt.');
if (strlen($url) > 600 || strlen($user) > 200 || strlen($pass) > 300) nein('Angaben zu lang.');

$p = parse_url($url);
if (!$p || ($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || isset($p['query']) || isset($p['fragment'])) nein('Nur https-Adressen ohne Zusatz.');
$pfad = (string)($p['path'] ?? '/');
if (str_contains($pfad, '..')) nein('Pfad nicht erlaubt.');
// Nur der Ordner KOMPASS und Dateien kompass-*.json darin
$istOrdner = (bool)preg_match('#/KOMPASS/?$#', $pfad);
$istDatei = (bool)preg_match('#/KOMPASS/kompass-[a-z0-9-]{1,40}\.json$#', $pfad);
if (!$istOrdner && !$istDatei) nein('Nur der Ordner KOMPASS ist erlaubt.');
if ($methode === 'MKCOL' && !$istOrdner) nein('Nur der Ordner KOMPASS.');
if (($methode === 'GET' || $methode === 'PUT') && !$istDatei) nein('Nur KOMPASS-Dateien.');

// Keine internen Adressen (Schutz gegen Missbrauch der Durchleitung); Adresse festnageln
$host = $p['host'];
$port = (int)($p['port'] ?? 443);
if (!in_array($port, [443, 8443], true)) nein('Nur Port 443.');
$ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
if (!$ips) aus(['status' => 'fehler', 'antwort' => 'Adresse nicht gefunden.'], 502);
foreach ($ips as $ip) {
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) nein('Interne Adressen sind nicht erlaubt.');
}

$inhalt = (string)($in['inhalt'] ?? '');
if (strlen($inhalt) > MAX_BYTES) nein('Datei zu groß.', 413);
if (!function_exists('curl_init')) aus(['status' => 'fehler', 'antwort' => 'Server kann keine Verbindung aufbauen.'], 500);

$ch = curl_init($url);
$kopf = ['User-Agent: KOMPASS-Sync/1'];
$opts = [
    CURLOPT_CUSTOMREQUEST => $methode, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_RESOLVE => [$host . ':' . $port . ':' . $ips[0]],
    CURLOPT_HTTPAUTH => CURLAUTH_BASIC, CURLOPT_USERPWD => $user . ':' . $pass,
    CURLOPT_MAXFILESIZE => MAX_BYTES,
];
if ($methode === 'PUT') { $opts[CURLOPT_POSTFIELDS] = $inhalt; $kopf[] = 'Content-Type: application/json; charset=utf-8'; }
if ($methode === 'PROPFIND') { $kopf[] = 'Depth: 0'; }
$opts[CURLOPT_HTTPHEADER] = $kopf;
curl_setopt_array($ch, $opts);
$res = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);
if ($res === false) aus(['status' => 'fehler', 'antwort' => 'Speicher nicht erreichbar.', 'grund' => mb_substr($err, 0, 200)], 502);
if (strlen((string)$res) > MAX_BYTES) $res = '';

aus(['status' => 'ok', 'code' => $code, 'inhalt' => $methode === 'GET' && $code === 200 ? (string)$res : null]);
