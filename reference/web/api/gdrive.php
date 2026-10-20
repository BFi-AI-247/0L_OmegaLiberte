<?php
// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// gdrive.php – Google-Anmeldung für den Speicher-Konnektor (Durchleitung)
// ===================================================================
// GET                                  → { status, bereit, client_id }  (Client-ID ist öffentlich)
// POST { aktion: "code", code }        → tauscht den Anmelde-Code gegen Tokens
// POST { aktion: "refresh", refresh_token } → holt einen frischen Zugangs-Token
// POST { aktion: "abmelden", token }   → widerruft den Token bei Google
//
// Schlüssel: google_client_id, google_client_secret aus config.php (Fundort: api/_instanz.php)
// Speichert NICHTS: Tokens gehen nur an das Gerät zurück. Die Dateien im Drive
// liest und schreibt die App direkt bei Google (HTTPS), nicht über dieses Backend.
// ===================================================================
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/_instanz.php';
define('PRIVAT_CFG', ol_konfig_pfad());
define('PRIVAT_KOMPASS', ol_datenordner());

function aus(array $d, int $code = 200): never {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$cfg = is_readable(PRIVAT_CFG) ? (include PRIVAT_CFG) : null;
$id = is_array($cfg) ? (string)($cfg['google_client_id'] ?? '') : '';
$secret = is_array($cfg) ? (string)($cfg['google_client_secret'] ?? '') : '';
$bereit = $id !== '' && $secret !== '';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    aus(['status' => 'ok', 'bereit' => $bereit, 'client_id' => $bereit ? $id : null]);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') aus(['status' => 'fehler'], 405);
if (!$bereit) aus(['status' => 'pause', 'antwort' => 'Google ist im Backend noch nicht eingerichtet.']);

$origin = rtrim((string)($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
$erlaubt = ol_erlaubte_herkunft(is_array($cfg) ? $cfg : []);
if ($origin === '' || !in_array($origin, $erlaubt, true)) aus(['status' => 'abgelehnt'], 403);

// Bremse: höchstens 60 Anfragen je IP-Hash und Stunde
$dir = PRIVAT_KOMPASS . '/zaehler';
if (is_dir($dir) || @mkdir($dir, 0750, true)) {
    $f = $dir . '/g-' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . gmdate('YmdH')) . '.txt';
    $n = (int)@file_get_contents($f) + 1;
    @file_put_contents($f, (string)$n, LOCK_EX);
    if ($n > 60) aus(['status' => 'limit', 'antwort' => 'Zu viele Anmeldeversuche. Bitte später noch einmal.'], 429);
}

$roh = file_get_contents('php://input') ?: '';
if (strlen($roh) > 8000) aus(['status' => 'abgelehnt'], 413);
$in = json_decode($roh, true);
if (!is_array($in)) aus(['status' => 'fehler'], 400);

function post_form(string $url, array $felder): array {
    $body = http_build_query($felder);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body, 'timeout' => 15, 'ignore_errors' => true]]);
        $res = @file_get_contents($url, false, $ctx);
        $code = 0;
        foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) $code = (int)$m[1];
    }
    return [$code, is_string($res) ? (json_decode($res, true) ?: []) : []];
}

$aktion = (string)($in['aktion'] ?? '');
if ($aktion === 'code' || $aktion === 'refresh') {
    $felder = ['client_id' => $id, 'client_secret' => $secret];
    if ($aktion === 'code') {
        $code = (string)($in['code'] ?? '');
        if ($code === '' || strlen($code) > 1000) aus(['status' => 'fehler'], 400);
        $felder += ['code' => $code, 'grant_type' => 'authorization_code', 'redirect_uri' => 'postmessage'];
    } else {
        $rt = (string)($in['refresh_token'] ?? '');
        if ($rt === '' || strlen($rt) > 1000) aus(['status' => 'fehler'], 400);
        $felder += ['refresh_token' => $rt, 'grant_type' => 'refresh_token'];
    }
    [$http, $d] = post_form('https://oauth2.googleapis.com/token', $felder);
    if ($http !== 200 || empty($d['access_token'])) {
        aus(['status' => 'abgelaufen', 'antwort' => 'Google-Anmeldung abgelaufen oder widerrufen. Bitte neu verbinden.', 'grund' => (string)($d['error'] ?? 'http ' . $http)], 401);
    }
    aus(array_filter([
        'status' => 'ok',
        'access_token' => (string)$d['access_token'],
        'expires_in' => (int)($d['expires_in'] ?? 3600),
        'refresh_token' => isset($d['refresh_token']) ? (string)$d['refresh_token'] : null,
        'scope' => (string)($d['scope'] ?? ''),
    ], fn($v) => $v !== null));
}
if ($aktion === 'abmelden') {
    $t = (string)($in['token'] ?? '');
    if ($t !== '' && strlen($t) <= 1000) post_form('https://oauth2.googleapis.com/revoke', ['token' => $t]);
    aus(['status' => 'ok']);
}
aus(['status' => 'fehler'], 400);
