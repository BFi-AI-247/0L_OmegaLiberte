<?php
// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// feed.php – holt freigegebene RSS-/Atom-Feeds für die KOMPASS-Web-App
// ===================================================================
// Warum: Browser dürfen die meisten Feeds wegen CORS nicht direkt abrufen.
// Sicherheit: nur Quellen aus der Allowlist (kein offener Proxy).
// Datenschutz: keine Nutzerdaten, keine IP-Protokolle. Gespeichert wird nur
//              der Feed selbst als Puffer (10 Minuten).
// Aufruf:  GET feed.php?quelle=radar
// Ausgabe: { status, quelle, titel, abgerufen, eintraege: [ {titel, link, datum, text, rubriken} ] }
// ===================================================================
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
require __DIR__ . '/_instanz.php';
if (OL_HERKUNFT) { header('Access-Control-Allow-Origin: ' . OL_HERKUNFT[0]); header('Vary: Origin'); }

const QUELLEN = [
    'radar'          => ['name' => 'RADAR 724',            'url' => 'https://radar724.de/feed.xml'],
    'radar-artikel'  => ['name' => 'RADAR 724 · Artikel',  'url' => 'https://radar724.de/feed-artikel.xml'],  // #102: ein Eintrag je Artikel
    'radar-gifhorn'  => ['name' => 'Wiesenzeitung Gifhorn', 'url' => 'https://radar724.de/wiesenzeitung_gifhorn/feed.xml'],
    'radar-borkum'   => ['name' => 'Wattpost Borkum',       'url' => 'https://radar724.de/borkum_kurier/feed.xml'],
    'radar-idstein'  => ['name' => 'Idsteiner Hexenpost',   'url' => 'https://radar724.de/idstein/feed.xml'],
];
const PUFFER_SEKUNDEN = 600;
const MAX_BYTES = 3_000_000;

function raus(int $code, array $daten): never {
    http_response_code($code);
    header('Cache-Control: ' . ($code === 200 ? 'public, max-age=300' : 'no-store'));
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$key = (string)($_GET['quelle'] ?? '');
if (!isset(QUELLEN[$key])) {
    raus(400, ['status' => 'fehler', 'meldung' => 'Unbekannte Quelle.', 'quellen' => array_keys(QUELLEN)]);
}
$quelle = QUELLEN[$key];

// ---------- Puffer-Ordner (außerhalb des Web-Ordners, sonst Temp) ------
function puffer_ordner(): string {
    $priv = ol_datenordner() . '/puffer';
    if (is_dir($priv) || @mkdir($priv, 0750, true)) return $priv;
    $tmp = sys_get_temp_dir() . '/kompass-puffer';
    if (!is_dir($tmp)) @mkdir($tmp, 0700, true);
    return $tmp;
}
$datei = puffer_ordner() . '/' . $key . '.json';

if (is_readable($datei) && filemtime($datei) > time() - PUFFER_SEKUNDEN) {
    $gepuffert = file_get_contents($datei);
    if ($gepuffert !== false) {
        header('Cache-Control: public, max-age=300');
        echo $gepuffert;
        exit;
    }
}

// ---------- Abrufen -----------------------------------------------------
$ch = curl_init($quelle['url']);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 3,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_USERAGENT      => ol_user_agent(),
    CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
]);
$roh = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if (!is_string($roh) || $http !== 200 || strlen($roh) > MAX_BYTES) {
    // Lieber alten Puffer als gar nichts
    if (is_readable($datei)) { echo file_get_contents($datei); exit; }
    raus(502, ['status' => 'fehler', 'meldung' => 'Quelle gerade nicht erreichbar.']);
}

// ---------- Reparieren --------------------------------------------------
// 1) HTML-Entitäten (z. B. &middot;), die XML nicht kennt, in Zeichen umwandeln
$roh = preg_replace_callback('/&([a-zA-Z][a-zA-Z0-9]*);/', function ($m) {
    if (in_array($m[1], ['amp', 'lt', 'gt', 'quot', 'apos'], true)) return $m[0];
    $z = html_entity_decode($m[0], ENT_HTML5 | ENT_QUOTES, 'UTF-8');
    return $z === $m[0] ? '&amp;' . $m[1] . ';' : htmlspecialchars($z, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}, $roh);

// 1b) Rohe „&“ (z. B. in category von feed-artikel.xml, #102) – sonst verwirft der XML-Leser den ganzen Feed
$roh = preg_replace('/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/', '&amp;', $roh);

// 2) Doppelt kodierte Umlaute („Ã¼“ statt „ü“) zurückführen
function heile(string $s): string {
    $s = trim(html_entity_decode($s, ENT_HTML5 | ENT_QUOTES, 'UTF-8'));
    if (preg_match('/Ã.|â€|Â./u', $s)) {
        $z = @mb_convert_encoding($s, 'Windows-1252', 'UTF-8');
        if (is_string($z) && mb_check_encoding($z, 'UTF-8') && !preg_match('/Ã.|â€/u', $z)) return $z;
    }
    return $s;
}

libxml_use_internal_errors(true);
$xml = simplexml_load_string($roh, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
if ($xml === false) {
    if (is_readable($datei)) { echo file_get_contents($datei); exit; }
    raus(502, ['status' => 'fehler', 'meldung' => 'Feed konnte nicht gelesen werden.']);
}

// ---------- Vereinheitlichen (RSS 2.0 und Atom) -------------------------
$eintraege = [];
$titel = $quelle['name'];
if (isset($xml->channel)) {
    $titel = heile((string)$xml->channel->title) ?: $titel;
    foreach ($xml->channel->item as $it) {
        $kats = [];
        foreach ($it->category as $c) $kats[] = heile((string)$c);
        $eintraege[] = [
            'titel'    => heile((string)$it->title),
            'link'     => trim((string)$it->link),
            'datum'    => ($t = strtotime((string)$it->pubDate)) ? gmdate('c', $t) : null,
            'text'     => mb_substr(heile(strip_tags((string)$it->description)), 0, 600),
            'rubriken' => $kats,
        ];
    }
} elseif ($xml->getName() === 'feed') {
    $titel = heile((string)$xml->title) ?: $titel;
    foreach ($xml->entry as $e) {
        $link = '';
        foreach ($e->link as $l) { if ((string)$l['rel'] === '' || (string)$l['rel'] === 'alternate') { $link = (string)$l['href']; break; } }
        $eintraege[] = [
            'titel'    => heile((string)$e->title),
            'link'     => $link,
            'datum'    => ($t = strtotime((string)($e->updated ?: $e->published))) ? gmdate('c', $t) : null,
            'text'     => mb_substr(heile(strip_tags((string)($e->summary ?: $e->content))), 0, 600),
            'rubriken' => [],
        ];
    }
}

$daten = [
    'status'    => 'ok',
    'quelle'    => $key,
    'titel'     => $titel,
    'abgerufen' => gmdate('c'),
    'eintraege' => array_slice($eintraege, 0, 100),
];
$json = json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
@file_put_contents($datei, $json, LOCK_EX);
raus(200, $daten);
