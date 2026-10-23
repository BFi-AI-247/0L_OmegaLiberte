<?php
// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// markt.php – Werte für die Karte „Markt am Morgen“ (Issue #24, Modul markt)
// GET markt.php → { status, dollar: { kurs, datum, vortag, vortagDatum, prozent }, quelle }
// Dollar/Euro: EZB-Referenzkurse (amtlich, ohne Schlüssel), Datei der letzten 90 Tage – daraus Kurs und Vortag.
// Heizöl (#24): Deutschlandpreis nur aus offizieller Quelle (folgt, Karte A021), Gifhorn nur als Link; Portale
// werden nicht ausgelesen. VW Vz / DAX erst mit erlaubter Quelle.
// Datenschutz: keine Nutzerdaten; gespeichert wird nur der Puffer (3 Stunden).
// ===================================================================
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
require __DIR__ . '/_instanz.php';

const EZB_90 = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
const MARKT_PUFFER = 3 * 3600;

function markt_raus(int $code, array $d, int $cache = 0): never {
    http_response_code($code);
    header('Cache-Control: ' . ($cache > 0 ? 'public, max-age=' . $cache : 'no-store'));
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
$site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
if ($site !== '' && !in_array($site, ['same-origin', 'none'], true)) markt_raus(403, ['status' => 'abgelehnt']);

function markt_puffer(): string {
    $p = ol_datenordner() . '/puffer';
    if (!is_dir($p) && !@mkdir($p, 0750, true)) { $p = sys_get_temp_dir() . '/kompass-puffer'; if (!is_dir($p)) @mkdir($p, 0700, true); }
    return $p . '/markt.json';
}
/** EZB-XML → [[datum, kurs], …] neueste zuerst (nur USD) */
function ezb_usd(string $xml): array {
    $out = [];
    if (preg_match_all('~<Cube\s+time=["\'](\d{4}-\d{2}-\d{2})["\']\s*>(.*?)</Cube>~s', $xml, $tage, PREG_SET_ORDER)) {
        foreach ($tage as $t) {
            if (preg_match('~currency=["\']USD["\']\s+rate=["\']([0-9.]+)["\']~', $t[2], $m)) $out[] = [$t[1], (float)$m[1]];
        }
    }
    usort($out, fn($a, $b) => strcmp($b[0], $a[0]));
    return $out;
}
function markt_bauen(?string $xml): array {
    $usd = is_string($xml) ? ezb_usd($xml) : [];
    if (count($usd) < 2) return ['status' => 'fehler', 'meldung' => 'EZB-Kurse gerade nicht erreichbar.'];
    [[$d0, $k0], [$d1, $k1]] = $usd;
    return ['status' => 'ok', 'abgerufen' => gmdate('c'),
        'dollar' => ['kurs' => $k0, 'datum' => $d0, 'vortag' => $k1, 'vortagDatum' => $d1, 'prozent' => round(($k0 / $k1 - 1) * 100, 2)],
        'quelle' => ['dollar' => 'EZB-Referenzkurs']];
}

$datei = markt_puffer();
if (is_readable($datei) && filemtime($datei) > time() - MARKT_PUFFER) { header('Cache-Control: public, max-age=900'); readfile($datei); exit; }
$ch = curl_init(EZB_90);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => ol_user_agent(), CURLOPT_ENCODING => '']);
$xml = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
if ($code !== 200) $xml = null;
$d = markt_bauen(is_string($xml) ? $xml : null);
if ($d['status'] !== 'ok') {
    if (is_readable($datei)) { readfile($datei); exit; }   // alter Stand besser als nichts
    markt_raus(502, $d);
}
@file_put_contents($datei, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
markt_raus(200, $d, 900);
