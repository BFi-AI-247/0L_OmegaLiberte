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
$cfgFile = ol_konfig_pfad();
$cfg = is_readable($cfgFile) ? (include $cfgFile) : null;
$kiBereit = is_array($cfg) && !empty($cfg['mistral_key']);

echo json_encode([
    'status' => 'ok',
    'dienst' => 'kompass',
    'stufe'  => 'v0',
    'zeit'   => gmdate('c'),
    'ki'     => $kiBereit ? 'bereit' : 'wartet',
], JSON_UNESCAPED_UNICODE);
