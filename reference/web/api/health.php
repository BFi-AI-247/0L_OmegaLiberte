<?php
// SPDX-License-Identifier: AGPL-3.0-only
// health.php – Lebenszeichen des KOMPASS-Backends
// Gibt nur aus, ob der Dienst läuft und ob die KI-Anbindung grundsätzlich bereit ist.
// Keine Pfade, keine Schlüssel, keine Versionsdetails des Servers.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/_instanz.php';
$cfg = ol_konfig();
$kiBereit = !empty($cfg['mistral_key']);
// config.php vorhanden, aber nicht lesbar (Syntaxfehler)? Nur die Zeile nennen, keine Inhalte.
$konfig = ol_konfig_pfad() === '' ? 'keine' : (isset($GLOBALS['OL_KONFIG_FEHLER'])
    ? 'fehlerhaft' . (preg_match('/Zeile (\d+)/', $GLOBALS['OL_KONFIG_FEHLER'], $m) ? ' (Zeile ' . $m[1] . ')' : '') : 'ok');

echo json_encode([
    'status' => 'ok',
    'dienst' => 'kompass',
    'stufe'  => 'v0',
    'zeit'   => gmdate('c'),
    'ki'     => $kiBereit ? 'bereit' : 'wartet',
    'konfig' => $konfig,
], JSON_UNESCAPED_UNICODE);
