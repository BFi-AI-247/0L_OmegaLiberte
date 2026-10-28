<?php
// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// markt.php – Werte für die Karte „Markt am Morgen“ (Issue #24, Modul markt)
// GET markt.php → { status, dollar: { kurs, datum, vortag, vortagDatum, prozent }, heizoel?: { je100l, stand }, quelle }
// Dollar/Euro: EZB-Referenzkurse (amtlich, ohne Schlüssel), Datei der letzten 90 Tage – daraus Kurs und Vortag.
// Heizöl (#24, #51): Deutschlandpreis aus dem EU Weekly Oil Bulletin (Preise mit Steuern, XLSX, feste Adresse laut M029),
// einmal am Tag; Gifhorn nur als Link, Portale werden nicht ausgelesen. VW Vz / DAX erst mit erlaubter Quelle.
// Datenschutz: keine Nutzerdaten; gespeichert wird nur der Puffer (3 Stunden).
// ===================================================================
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
require __DIR__ . '/_instanz.php';

const EZB_90 = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
const MARKT_PUFFER = 3 * 3600;
const OIL_BULLETIN = 'https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en';  // M029: Prices with taxes
const OIL_PUFFER = 20 * 3600;

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
/** Zellen einer XLSX-Tabelle (erstes Blatt) als [zeile => [spalte => text]] – ohne Bibliothek, nur ZipArchive */
function xlsx_zellen(string $bytes): ?array {
    if (!class_exists('ZipArchive')) return null;
    $tmp = tempnam(sys_get_temp_dir(), 'ob'); if ($tmp === false) return null;
    file_put_contents($tmp, $bytes); $z = new ZipArchive();
    if ($z->open($tmp) !== true) { @unlink($tmp); return null; }
    $ss = []; $sx = $z->getFromName('xl/sharedStrings.xml');
    if (is_string($sx) && preg_match_all('~<si>(.*?)</si>~s', $sx, $m)) foreach ($m[1] as $si) {
        preg_match_all('~<t[^>]*>(.*?)</t>~s', $si, $t); $ss[] = html_entity_decode(implode('', $t[1]), ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
    $blatt = $z->getFromName('xl/worksheets/sheet1.xml'); $z->close(); @unlink($tmp);
    if (!is_string($blatt)) return null;
    $out = [];
    if (preg_match_all('~<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)~s', $blatt, $cs, PREG_SET_ORDER)) foreach ($cs as $c) {
        $v = ''; if (isset($c[4]) && preg_match('~<v>(.*?)</v>~s', $c[4], $vv)) $v = $vv[1]; elseif (isset($c[4]) && preg_match('~<t[^>]*>(.*?)</t>~s', $c[4], $vv)) $v = html_entity_decode($vv[1], ENT_QUOTES | ENT_XML1, 'UTF-8');
        if (preg_match('~t="s"~', $c[3]) && isset($ss[(int)$v])) $v = $ss[(int)$v];
        $out[(int)$c[2]][$c[1]] = trim(preg_replace('~\s+~u', ' ', $v));
    }
    ksort($out);
    return $out;
}
/** Heizöl Deutschland aus dem Oil Bulletin: Spalte mit „Heizöl“/„Heating gas oil“ in den Kopfzeilen, Zeile „Germany“ → € je 100 l */
function heizoel_aus(array $zellen): ?array {
    $spalte = null; $stand = null; $zeileDE = null;
    foreach ($zellen as $nr => $z) {
        foreach ($z as $sp => $t) {
            if ($spalte === null && preg_match('~Heizöl|Heating gas oil~iu', $t)) $spalte = $sp;
            if ($stand === null && preg_match('~^(20\d\d)-(\d\d)-(\d\d)~', $t, $d)) $stand = $d[1] . '-' . $d[2] . '-' . $d[3];
            if ($stand === null && preg_match('~^(\d\d)/(\d\d)/(20\d\d)$~', $t, $d)) $stand = $d[3] . '-' . $d[2] . '-' . $d[1];
        }
        if ($zeileDE === null && preg_grep('~^(Germany|Deutschland|Allemagne)$~i', $z)) $zeileDE = $nr;
    }
    if ($spalte === null || $zeileDE === null) return null;
    $roh = str_replace([' ', ','], ['', '.'], (string)($zellen[$zeileDE][$spalte] ?? ''));
    if (!is_numeric($roh)) return null;
    $je1000 = (float)$roh; if ($je1000 < 300 || $je1000 > 5000) return null;  // Plausibilität (€ je 1000 l)
    return ['je100l' => round($je1000 / 10, 2), 'stand' => $stand];
}
function heizoel_holen(): ?array {
    $p = dirname(markt_puffer()) . '/heizoel.json';
    if (is_readable($p) && filemtime($p) > time() - OIL_PUFFER) { $d = json_decode((string)file_get_contents($p), true); return is_array($d) && isset($d['je100l']) ? $d : null; }
    $ch = curl_init(OIL_BULLETIN);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => ol_user_agent(), CURLOPT_MAXFILESIZE => 5_000_000]);
    $b = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    $d = ($code === 200 && is_string($b) && ($z = xlsx_zellen($b))) ? heizoel_aus($z) : null;
    if ($d) { @file_put_contents($p, json_encode($d), LOCK_EX); return $d; }
    @touch($p);  // Fehlschlag merken: nicht bei jedem Aufruf neu laden (alter Inhalt bleibt Rückfall)
    $alt = is_readable($p) ? json_decode((string)file_get_contents($p), true) : null;
    return is_array($alt) && isset($alt['je100l']) ? $alt : null;
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
if ($d['status'] === 'ok' && ($hz = heizoel_holen())) { $d['heizoel'] = $hz; $d['quelle']['heizoel'] = 'EU Weekly Oil Bulletin'; }
if ($d['status'] !== 'ok') {
    if (is_readable($datei)) { readfile($datei); exit; }   // alter Stand besser als nichts
    markt_raus(502, $d);
}
@file_put_contents($datei, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
markt_raus(200, $d, 900);
