<?php
// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// rss.php – RSS/Atom- und YouTube-Feeds für die KOMPASS-Web-App
// ===================================================================
// Warum: Browser dürfen fremde Feeds wegen CORS meist nicht direkt abrufen.
//
// GET rss.php?aktion=feed&url=<Feed-Adresse>
//   → { status, titel, seite, eintraege: [ {titel, link, datum, text, bild, autor, video} ] }
// GET rss.php?aktion=finden&url=<Website, YouTube-Kanal oder Feed>
//   → { status, name, bild, seite, gefunden: [ {url, titel, art: "youtube"|"rss"} ] }
// POST rss.php?aktion=sammel  { "urls": [ … ] }  → viele Feeds in einem Aufruf, parallel abgerufen (siehe unten)
// GET rss.php?aktion=medien&url=<Seite> → Video/Audio einer Seite
//
// Bremse: zählt nur echte Abrufe nach außen (Puffertreffer sind frei) – Familien teilen sich eine IP.
// Lange Feeds (Podcasts): nach 30 vollständigen Einträgen wird der Abruf beendet und der Feed sauber geschlossen.
//
// Schutz: nur http/https auf Port 80/443, keine internen Adressen (auch nicht nach
// Umleitungen – jede Station wird geprüft und die IP festgenagelt), Seiten höchstens 3 MB, Feeds höchstens 15 MB,
// Bremse je IP-Hash, Puffer 10 Minuten (Feeds) bzw. 1 Tag (Suche).
// Datenschutz: keine Nutzerdaten, keine Protokolle; gespeichert wird nur der Puffer.
// ===================================================================
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/_instanz.php';
define('PRIVAT_KOMPASS', ol_datenordner());
const MAX_BYTES = 3_000_000;        // Seiten (HTML) und Feeds ohne erkennbare Einträge
const FEED_MAX_BYTES = 15_000_000;  // harte Grenze für lange Feeds (z. B. Podcasts mit Hunderten Folgen)
const FEED_EINTRAEGE = 30;          // so viele Einträge liest lies_feed – danach darf ein großer Abruf enden
const SAMMEL_MAX = 30;              // Feeds je Sammelabruf
const PARALLEL = 8;                 // gleichzeitige Verbindungen nach außen
const GESAMT_SEKUNDEN = 18;         // Zeitbudget je Aufruf
const BREMSE_STUNDE = 400;          // echte Abrufe nach außen je IP-Hash und Stunde (Puffertreffer zählen nicht)
define('UA', ol_user_agent());
// Nur für lokale Tests (php -S mit KOMPASS_TEST=1): 127.0.0.1 als Ziel erlauben. Auf dem Server nie gesetzt.
define('TESTMODUS', PHP_SAPI === 'cli-server' && getenv('KOMPASS_TEST') === '1');

function raus(int $code, array $d, int $cache = 0): never {
    http_response_code($code);
    header('Cache-Control: ' . ($cache > 0 ? 'public, max-age=' . $cache : 'no-store'));
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function als_json(array $d): string {
    return (string)json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
}

// Nur Aufrufe aus der eigenen Seite (Browser senden Sec-Fetch-Site)
$site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
if ($site !== '' && !in_array($site, ['same-origin', 'none'], true)) raus(403, ['status' => 'abgelehnt']);

// ---------- Bremse: zählt nur, was wirklich nach außen geht -----------------
function bremse_datei(): ?string {
    $zdir = PRIVAT_KOMPASS . '/zaehler';
    if (!is_dir($zdir) && !@mkdir($zdir, 0750, true)) return null;
    return $zdir . '/r-' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . gmdate('YmdH')) . '.txt';
}
function bremse_rest(): int {
    $f = bremse_datei();
    return $f ? max(0, BREMSE_STUNDE - (int)@file_get_contents($f)) : BREMSE_STUNDE;
}
function bremse_buchen(int $n): void {
    if ($n <= 0 || !($f = bremse_datei())) return;
    $h = @fopen($f, 'c+');
    if (!$h) return;
    flock($h, LOCK_EX);
    $alt = (int)stream_get_contents($h);
    ftruncate($h, 0); rewind($h); fwrite($h, (string)($alt + $n));
    flock($h, LOCK_UN); fclose($h);
}

// ---------- Puffer ---------------------------------------------------------
function puffer_ordner(): string {
    $p = PRIVAT_KOMPASS . '/puffer';
    if (is_dir($p) || @mkdir($p, 0750, true)) return $p;
    $t = sys_get_temp_dir() . '/kompass-puffer';
    if (!is_dir($t)) @mkdir($t, 0700, true);
    return $t;
}
function puffer_datei(string $aktion, string $url): string { return puffer_ordner() . '/rss-' . $aktion . '-' . sha1($url) . '.json'; }
function puffer_frisch(string $datei, int $sek): bool { return is_readable($datei) && filemtime($datei) > time() - $sek; }
function norm_url(string $u): string {
    $u = trim($u);
    if ($u === '' || strlen($u) > 800) return '';
    return preg_match('#^https?://#i', $u) ? $u : 'https://' . ltrim($u, '/');
}

// ---------- Sicher abrufen ------------------------------------------------
function pruefe_url(string $u): ?array {
    $p = parse_url($u);
    if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host']) || isset($p['user'])) return null;
    $port = (int)($p['port'] ?? (strtolower($p['scheme']) === 'https' ? 443 : 80));
    $host = strtolower($p['host']);
    if (TESTMODUS && $host === '127.0.0.1') return ['host' => $host, 'port' => $port, 'ip' => $host];
    if (!in_array($port, [80, 443], true)) return null;
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
    if (!$ips) return null;
    foreach ($ips as $ip) if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return null;
    return ['host' => $host, 'port' => $port, 'ip' => $ips[0]];
}
function absolut(string $basis, string $rel): string {
    $rel = trim(html_entity_decode($rel, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($rel === '') return '';
    if (preg_match('#^https?://#i', $rel)) return $rel;
    $b = parse_url($basis);
    $wurzel = ($b['scheme'] ?? 'https') . '://' . ($b['host'] ?? '') . (isset($b['port']) ? ':' . $b['port'] : '');
    if (str_starts_with($rel, '//')) return ($b['scheme'] ?? 'https') . ':' . $rel;
    if (str_starts_with($rel, '/')) return $wurzel . $rel;
    $pfad = $b['path'] ?? '/';
    $pfad = substr($pfad, 0, (int)strrpos($pfad, '/') + 1);
    return $wurzel . $pfad . $rel;
}
/** Ein Abruf ohne Umleitungen; $st sammelt Inhalt, Umleitungsziel und Zustand. */
function curl_neu(string $u, array $z, int $sek, array &$st): CurlHandle {
    $kopf = ['Accept: application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
             'Accept-Language: de-DE,de;q=0.9,en;q=0.7'];
    // YouTube zeigt EU-Servern sonst eine Einwilligungsseite statt des Kanals
    if (preg_match('#(^|\.)youtube\.com$#', $z['host'])) $kopf[] = 'Cookie: SOCS=CAI; CONSENT=YES+cb';
    $ch = curl_init($u);
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => $sek, CURLOPT_CONNECTTIMEOUT => min(6, $sek),
        CURLOPT_USERAGENT => UA, CURLOPT_HTTPHEADER => $kopf, CURLOPT_ENCODING => '',
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_RESOLVE => [$z['host'] . ':' . $z['port'] . ':' . $z['ip']],
        CURLOPT_HEADERFUNCTION => function ($ch, $h) use (&$st) { if (stripos($h, 'location:') === 0) $st['ziel'] = trim(substr($h, 9)); return strlen($h); },
        // Lange Feeds: nach FEED_EINTRAEGE vollständigen Einträgen aufhören statt an der Größengrenze zu scheitern
        CURLOPT_WRITEFUNCTION => function ($ch, $daten) use (&$st) {
            $alt = strlen($st['buf']);
            $st['buf'] .= $daten;
            $neu = substr($st['buf'], max(0, $alt - 12));
            $st['items'] += preg_match_all('#</(?:[\w-]+:)?(?:item|entry)\s*>#i', $neu);
            $len = $alt + strlen($daten);
            if ($st['items'] >= FEED_EINTRAEGE && $len > 1_000_000) { $st['gekuerzt'] = true; return 0; }
            if ($len > FEED_MAX_BYTES || ($len > MAX_BYTES && $st['items'] === 0)) {
                if ($st['items'] > 0) $st['gekuerzt'] = true; else $st['zugross'] = true;
                return 0;
            }
            return strlen($daten);
        },
    ]);
    return $ch;
}
/** Feed nach dem letzten vollständigen Eintrag abschneiden und wieder schließen. */
function kuerzen(string $b): string {
    if (!preg_match_all('#</(?:[\w-]+:)?(?:item|entry)\s*>#i', $b, $m, PREG_OFFSET_CAPTURE)) return $b;
    $letzter = end($m[0]);
    $b = substr($b, 0, $letzter[1] + strlen($letzter[0]));
    $wurzel = preg_match('#<(rss|feed|rdf:RDF)\b#i', substr($b, 0, 4000), $w) ? strtolower($w[1]) : 'rss';
    return $b . ($wurzel === 'feed' ? '</feed>' : ($wurzel === 'rdf:rdf' ? '</rdf:RDF>' : '</channel></rss>'));
}
/**
 * Mehrere Adressen parallel abrufen (curl_multi). Jede Station einer Umleitung wird erneut geprüft und die IP festgenagelt.
 * @return array<int, array{0:int,1:string,2:string,3:string,4:bool}> [code (0 = Fehler, -1 = zu groß), inhalt, inhaltstyp, endgültige Adresse, gekürzt]
 */
function hole_viele(array $urls, int $proAbruf = 12): array {
    $ende = microtime(true) + GESAMT_SEKUNDEN;
    $erg = [];
    $offen = $urls;
    for ($runde = 0; $runde < 5 && $offen; $runde++) {
        if ($ende - microtime(true) < 2) break;
        $mh = curl_multi_init();
        $warte = array_keys($offen); $aktiv = []; $st = []; $weiter = [];
        $fuege = function () use (&$warte, &$aktiv, &$st, &$erg, $mh, $offen, $ende, $proAbruf) {
            while ($warte && count($aktiv) < PARALLEL) {
                $i = array_shift($warte); $u = $offen[$i];
                $z = pruefe_url($u);
                if (!$z) { $erg[$i] = [0, '', '', $u, false]; continue; }
                $st[$i] = ['buf' => '', 'ziel' => null, 'items' => 0, 'gekuerzt' => false, 'zugross' => false];
                $ch = curl_neu($u, $z, max(2, min($proAbruf, (int)floor($ende - microtime(true)))), $st[$i]);
                curl_multi_add_handle($mh, $ch);
                $aktiv[spl_object_id($ch)] = [$i, $ch];
            }
        };
        $fuege();
        while ($aktiv) {
            curl_multi_exec($mh, $laeuft);
            if ($laeuft) curl_multi_select($mh, 0.5);
            while ($info = curl_multi_info_read($mh)) {
                $ch = $info['handle']; $id = spl_object_id($ch);
                if (!isset($aktiv[$id])) continue;
                $i = $aktiv[$id][0]; $s = $st[$i];
                $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                $typ = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
                curl_multi_remove_handle($mh, $ch); curl_close($ch); unset($aktiv[$id]);
                if (in_array($code, [301, 302, 303, 307, 308], true) && $s['ziel']) { $weiter[$i] = absolut($offen[$i], $s['ziel']); }
                elseif ($s['zugross']) $erg[$i] = [-1, '', $typ, $offen[$i], false];
                elseif ($info['result'] !== CURLE_OK && !$s['gekuerzt']) $erg[$i] = [0, '', $typ, $offen[$i], false];
                else $erg[$i] = [$code, $s['gekuerzt'] ? kuerzen($s['buf']) : $s['buf'], $typ, $offen[$i], $s['gekuerzt']];
                unset($st[$i]);
                $fuege();
            }
            if (microtime(true) > $ende + 2) break; // Sicherung; curl bricht normalerweise selbst ab
        }
        foreach ($aktiv as [$i, $ch]) { curl_multi_remove_handle($mh, $ch); curl_close($ch); $erg[$i] = [0, '', '', $offen[$i], false]; }
        curl_multi_close($mh);
        $offen = $weiter;
    }
    foreach ($urls as $i => $u) if (!isset($erg[$i])) $erg[$i] = [0, '', '', $offen[$i] ?? $u, false];
    ksort($erg);
    return $erg;
}
/** @return array{0:int,1:string,2:string,3:string,4:bool} */
function hole(string $u): array { return hole_viele([$u])[0]; }

// ---------- Lesen ---------------------------------------------------------
function text(string $s, int $max = 600): string {
    $s = preg_replace('#<(script|style)[^>]*>.*?</\1>#is', ' ', $s) ?? $s;
    $s = preg_replace('#<br\s*/?>|</p>#i', "\n", $s) ?? $s;
    $s = html_entity_decode(strip_tags($s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = trim(preg_replace("/[ \t\x{00A0}]+/u", ' ', preg_replace("/\n\s*\n+/", "\n\n", $s) ?? $s) ?? $s);
    // #65: Platzhalter einiger Feeds („NONE“, „null“, „n/a“) sind kein Text
    if (preg_match('#^(none|null|undefined|n/?a|-)$#i', $s)) return '';
    return mb_strlen($s) > $max ? rtrim(mb_substr($s, 0, $max - 1)) . '…' : $s;
}
function ist_feed(string $body): bool {
    if (ist_jsonfeed($body)) return true;
    $kopf = substr(ltrim(substr($body, 0, 20000), "\xEF\xBB\xBF \t\r\n"), 0, 2000);
    return (bool)preg_match('#^(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*(<\?xml-stylesheet[^>]*>\s*)*<(rss|feed|rdf:RDF)\b#is', $kopf);
}
function dom_xml(string $body): ?DOMXPath {
    $body = preg_replace_callback('/&([a-zA-Z][a-zA-Z0-9]*);/', function ($m) {
        if (in_array($m[1], ['amp', 'lt', 'gt', 'quot', 'apos'], true)) return $m[0];
        $z = html_entity_decode($m[0], ENT_HTML5 | ENT_QUOTES, 'UTF-8');
        return $z === $m[0] ? '&amp;' . $m[1] . ';' : htmlspecialchars($z, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }, $body) ?? $body;
    libxml_use_internal_errors(true);
    $d = new DOMDocument();
    if (!$d->loadXML($body, LIBXML_NONET | LIBXML_NOCDATA | LIBXML_COMPACT)) return null;
    return new DOMXPath($d);
}
function kind(DOMXPath $x, DOMNode $n, string $name): ?DOMElement {
    $r = $x->query('./*[local-name()="' . $name . '"]', $n);
    return $r && $r->length ? $r->item(0) : null;
}
function kt(DOMXPath $x, DOMNode $n, string $name): string { $e = kind($x, $n, $name); return $e ? trim($e->textContent) : ''; }
function erstes_bild(string $html, string $basis): string {
    return preg_match('#<img[^>]+src=["\']([^"\']+)["\']#i', $html, $m) ? absolut($basis, $m[1]) : '';
}
function ist_jsonfeed(string $body): bool {
    return (bool)preg_match('~^\s*\{.{0,400}?"version"\s*:\s*"https://jsonfeed\.org/version/~s', substr(ltrim($body, "\xEF\xBB\xBF"), 0, 2000));
}
function lies_feed(string $body, string $feedUrl): ?array {
    if (ist_jsonfeed($body)) return lies_jsonfeed($body, $feedUrl);
    $x = dom_xml($body);
    if (!$x) return null;
    $root = $x->document->documentElement;
    $atom = $root->localName === 'feed';
    $kanal = $atom ? $root : ($x->query('//*[local-name()="channel"]')->item(0) ?? $root);
    $titel = text(kt($x, $kanal, 'title'), 120);
    $seite = '';
    foreach ($x->query('./*[local-name()="link"]', $kanal) as $l) {
        /** @var DOMElement $l */
        if ($atom) { if (in_array($l->getAttribute('rel'), ['', 'alternate'], true)) { $seite = $l->getAttribute('href'); break; } }
        elseif ($l->namespaceURI === null || $l->namespaceURI === '') { $seite = trim($l->textContent); break; }
    }
    $items = $x->query($atom ? './*[local-name()="entry"]' : '//*[local-name()="item"]', $atom ? $root : null);
    $out = [];
    foreach ($items as $it) {
        if (count($out) >= 30) break;
        $link = '';
        if ($atom) {
            foreach ($x->query('./*[local-name()="link"]', $it) as $l) { $r = $l->getAttribute('rel'); if ($r === '' || $r === 'alternate') { $link = $l->getAttribute('href'); break; } }
        } else {
            foreach ($x->query('./*[local-name()="link"]', $it) as $l) { if (trim($l->textContent) !== '') { $link = trim($l->textContent); break; } if ($l->getAttribute('href') !== '' && in_array($l->getAttribute('rel'), ['', 'alternate'], true)) $link = $l->getAttribute('href'); }
            if ($link === '') { $g = kind($x, $it, 'guid'); if ($g && preg_match('#^https?://#', trim($g->textContent))) $link = trim($g->textContent); }
        }
        $roh = $atom ? (kt($x, $it, 'content') ?: kt($x, $it, 'summary')) : (kt($x, $it, 'description') ?: kt($x, $it, 'encoded'));
        $voll = $atom ? kt($x, $it, 'content') : kt($x, $it, 'encoded');
        $datum = $atom ? (kt($x, $it, 'published') ?: kt($x, $it, 'updated')) : (kt($x, $it, 'pubDate') ?: kt($x, $it, 'date'));
        $video = kt($x, $it, 'videoId');
        $bild = '';
        foreach ($x->query('.//*[local-name()="thumbnail" or local-name()="content" or local-name()="enclosure"]', $it) as $m) {
            /** @var DOMElement $m */
            $u = $m->getAttribute('url'); $t = $m->getAttribute('type'); $med = $m->getAttribute('medium');
            $istBild = $m->localName === 'thumbnail' || str_starts_with($t, 'image/') || $med === 'image'
                || ($m->localName === 'content' && $t === '' && $med === '') || preg_match('#\.(jpe?g|png|webp|gif)(\?|$)#i', $u);
            if ($u && $istBild) { $bild = $u; break; }
        }
        if ($bild === '') $bild = erstes_bild($voll ?: $roh, $link ?: $feedUrl);
        // Video/Audio direkt im Feed (enclosure, media:content) – z. B. Sendungen, Podcasts
        $medien = null;
        foreach ($x->query('.//*[local-name()="enclosure" or local-name()="content"]', $it) as $m) {
            /** @var DOMElement $m */
            $u = $m->getAttribute('url'); $t = strtolower($m->getAttribute('type')); $med = strtolower($m->getAttribute('medium'));
            if ($u === '') continue;
            $art = (str_starts_with($t, 'video/') || $med === 'video' || preg_match('#\.(mp4|m4v|webm|m3u8)(\?|$)#i', $u) || $t === 'application/x-mpegurl' || $t === 'application/vnd.apple.mpegurl') ? 'video'
                : ((str_starts_with($t, 'audio/') || $med === 'audio' || preg_match('#\.(mp3|m4a|aac|ogg|opus)(\?|$)#i', $u)) ? 'audio' : '');
            if ($art) { $medien = ['url' => absolut($feedUrl, $u), 'art' => $art, 'typ' => $t]; break; }
        }
        $beschr = $roh;
        if ($video) { $g = $x->query('.//*[local-name()="group"]/*[local-name()="description"]', $it); if ($g->length) $beschr = $g->item(0)->textContent; }
        $autor = kt($x, $it, 'creator');
        if ($autor === '' && ($a = kind($x, $it, 'author'))) $autor = trim(kt($x, $a, 'name') ?: $a->textContent);
        $out[] = [
            'titel' => text(kt($x, $it, 'title'), 300),
            'link'  => $link ? absolut($feedUrl, $link) : '',
            'datum' => ($t = strtotime($datum)) ? gmdate('c', $t) : null,
            'text'  => text($beschr, 700),
            'bild'  => $bild,
            'autor' => text($autor, 80),
            'video' => $video ?: null,
            'medien' => $medien,
        ];
    }
    // #69: Sprache des Feeds (RSS <language>, Atom xml:lang) – zwei Buchstaben, sonst leer
    $sp = strtolower(trim($atom ? $root->getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') : kt($x, $kanal, 'language')));
    $sp = preg_match('/^([a-z]{2})(?:[-_][a-z0-9]+)?$/', $sp, $m2) ? $m2[1] : '';
    return ['titel' => $titel, 'seite' => $seite, 'sprache' => $sp, 'eintraege' => $out];
}

// ---------- JSON Feed 1.0/1.1 (von Mistral, M007 zu Karte A006; Regex-Trennzeichen in jf_absolut korrigiert) ----
function jf_string($v): string {
    if (is_string($v)) return $v;
    if (is_int($v) || is_float($v)) return (string)$v;
    return '';
}

function jf_get($o, string $k) {
    if (is_object($o)) {
        if (property_exists($o, $k)) return $o->{$k};
        return null;
    }
    if (is_array($o)) {
        if (array_key_exists($k, $o)) return $o[$k];
        return null;
    }
    return null;
}

function jf_klartext($v, int $limit): string {
    $s = jf_string($v);
    $s = preg_replace('/<br\\s*\\/?>/i', "\\n", $s);
    $s = preg_replace('/<\\/p\\s*>/i', "\\n", $s);
    $s = preg_replace('/<[^>]*>/', '', $s);
    $s = html_entity_decode($s, ENT_QUOTES, 'UTF-8');
    $s = preg_replace('/ {2,}/', ' ', $s);
    $s = preg_replace('/\\n{3,}/', "\\n\\n", $s);
    $s = trim($s);
    if (mb_strlen($s, 'UTF-8') > $limit) {
        $s = rtrim(mb_substr($s, 0, $limit - 1, 'UTF-8')) . '…';
    }
    return $s;
}

function jf_absolut($v, string $feedUrl): string {
    $u = jf_string($v);
    if ($u === '') return '';
    if (preg_match('#^https?://#i', $u)) return $u;
    if (!preg_match('~^(https?)://([^/?#]+)~i', $feedUrl, $m)) return $u;
    $schema = strtolower($m[1]);
    $host = $m[2];
    if (strpos($u, '//') === 0) return $schema . ':' . $u;
    if ($u[0] === '/') return $schema . '://' . $host . $u;
    $hostUrl = $schema . '://' . $host;
    $rest = substr($feedUrl, strlen($hostUrl));
    if (strpos($rest, '/') !== false) {
        $dir = $hostUrl . preg_replace('#/[^/]*$#', '/', $rest);
    } else {
        $dir = $hostUrl . '/';
    }
    return $dir . $u;
}

function jf_zeit($v): ?int {
    if (!is_string($v) || trim($v) === '') return null;
    $ts = strtotime($v);
    return $ts === false ? null : $ts;
}

function jf_datum($item): ?string {
    $t = jf_zeit(jf_get($item, 'date_published'));
    if ($t === null) $t = jf_zeit(jf_get($item, 'date_modified'));
    return $t === null ? null : gmdate('c', $t);
}

function jf_text($item): string {
    foreach (['content_text', 'summary', 'content_html'] as $k) {
        $v = jf_get($item, $k);
        if ($v !== null && !is_array($v) && !is_object($v)) {
            return jf_klartext($v, 700);
        }
    }
    return '';
}

function jf_autor($item, $feed): string {
    $a = jf_get($item, 'authors');
    if (is_array($a) && isset($a[0]) && is_object($a[0])) {
        $n = jf_get($a[0], 'name');
        if (is_string($n) && $n !== '') return $n;
    }
    $a = jf_get($item, 'author');
    if (is_object($a)) {
        $n = jf_get($a, 'name');
        if (is_string($n) && $n !== '') return $n;
    }
    $a = jf_get($feed, 'authors');
    if (is_array($a) && isset($a[0]) && is_object($a[0])) {
        $n = jf_get($a[0], 'name');
        if (is_string($n) && $n !== '') return $n;
    }
    return '';
}

function jf_medien($item, string $feedUrl): ?array {
    $atts = jf_get($item, 'attachments');
    if (!is_array($atts)) return null;
    foreach ($atts as $att) {
        if (!is_object($att)) continue;
        $mime = jf_get($att, 'mime_type');
        if (!is_string($mime)) continue;
        $m = strtolower(trim($mime));
        if (strpos($m, 'audio/') === 0) { $art = 'audio'; }
        elseif (strpos($m, 'video/') === 0) { $art = 'video'; }
        else { continue; }
        $url = jf_get($att, 'url');
        if (!is_string($url) || $url === '') continue;
        return ['url' => jf_absolut($url, $feedUrl), 'art' => $art, 'typ' => $m];
    }
    return null;
}

function lies_jsonfeed(string $body, string $feedUrl): ?array {
    $data = json_decode($body);
    if (!($data instanceof stdClass)) return null;
    $version = jf_get($data, 'version');
    if (!is_string($version) || !str_starts_with($version, 'https://jsonfeed.org/version/')) return null;

    $titel = jf_klartext(jf_get($data, 'title'), 300);
    $seite = jf_string(jf_get($data, 'home_page_url'));

    $items = jf_get($data, 'items');
    $eintraege = [];
    if (is_array($items)) {
        foreach ($items as $item) {
            if (!($item instanceof stdClass)) continue;
            if (count($eintraege) >= 30) break;
            $link = jf_get($item, 'url');
            if ($link === null) $link = jf_get($item, 'external_url');
            $bild = jf_get($item, 'image');
            if ($bild === null) $bild = jf_get($item, 'banner_image');
            $eintraege[] = [
                'titel'  => jf_klartext(jf_get($item, 'title'), 300),
                'link'   => jf_absolut($link, $feedUrl),
                'datum'  => jf_datum($item),
                'text'   => jf_text($item),
                'bild'   => jf_string($bild),
                'autor'  => jf_autor($item, $data),
                'video'  => null,
                'medien' => jf_medien($item, $feedUrl),
            ];
        }
    }
    return ['titel' => $titel, 'seite' => $seite, 'eintraege' => $eintraege];
}

// ---------- ARD Sounds (R009) – Sendung per Link, Folgen über die GraphQL-Schnittstelle (Feldnamen aus M014/A013) ----
// Erkannt: ardsounds.de/show/urn:ard:show:<id>, ardaudiothek.de/sendung/[<slug>/]urn:ard:show:<id>. Die Sendungsadresse
// selbst dient als Feed-Adresse in KOMPASS; abgerufen wird nur api.ardaudiothek.de (fester Host).
const ARD_API = 'https://api.ardaudiothek.de/graphql';
function ard_urn(string $u): ?string {
    $h = strtolower((string)parse_url($u, PHP_URL_HOST));
    if (!preg_match('~(^|\.)(ardsounds|ardaudiothek)\.de$~', $h)) return null;
    return preg_match('~urn:ard:show:([0-9a-f]{6,40})~i', rawurldecode($u), $m) ? 'urn:ard:show:' . strtolower($m[1]) : null;
}
// Folgen-Link (…/episode/urn:ard:episode:<id>) → Sendung (#19): item(id) { programSet { id coreId } } (M014, tisba/ardsounds).
// Die Sendung wird dann wie ein Sendungs-Link abonniert. coreId kann die nackte Kennung oder schon die URN sein.
function ard_folge(string $u): ?string {
    $h = strtolower((string)parse_url($u, PHP_URL_HOST));
    if (!preg_match('~(^|\.)(ardsounds|ardaudiothek)\.de$~', $h)) return null;
    return preg_match('~urn:ard:episode:([0-9a-f]{6,40})~i', rawurldecode($u), $m) ? 'urn:ard:episode:' . strtolower($m[1]) : null;
}
function ard_folge_zu_sendung(string $folge): ?string {
    $ch = curl_init(ARD_API);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['query' => '{ item(id: "' . $folge . '") { programSet { id coreId } } }']),
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_ENCODING => '', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => UA,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
    ]);
    $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    $j = is_string($body) ? json_decode($body, true) : null;
    $ps = ($code === 200 && is_array($j)) ? ($j['data']['item']['programSet'] ?? null) : null;
    if (!is_array($ps)) return null;
    foreach ([(string)($ps['coreId'] ?? ''), (string)($ps['id'] ?? '')] as $k) {
        if (preg_match('~^(?:urn:ard:show:)?([0-9a-f]{6,40})$~i', $k, $m)) return 'urn:ard:show:' . strtolower($m[1]);
    }
    return null;
}
function ard_bild($img): string {
    $u = is_array($img) ? (string)($img['url1X1'] ?? $img['url'] ?? '') : '';
    return str_replace('{width}', '640', $u);
}
/** Folgen einer Sendung → dasselbe Format wie aktion=feed (inkl. Puffer und gemerktem Fehler). */
function ard_feed(string $url, string $urn): array {
    $q = '{ programSet(id: "' . $urn . '") { title synopsis sharingUrl image { url url1X1 } '
       . 'items(first: 30, orderBy: PUBLISH_DATE_DESC, filter: { isPublished: { equalTo: true } }) '
       . '{ nodes { title summary synopsis sharingUrl url publishDate duration image { url url1X1 } audios { url mimeType } } } } }';
    $ch = curl_init(ARD_API);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['query' => $q]), CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false, CURLOPT_ENCODING => '',
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => UA,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_NOPROGRESS => false, CURLOPT_PROGRESSFUNCTION => fn($c, $dl, $got) => $got > MAX_BYTES ? 1 : 0,
    ]);
    $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    $j = is_string($body) ? json_decode($body, true) : null;
    $s = is_array($j) ? ($j['data']['programSet'] ?? null) : null;
    if ($code !== 200 || !is_array($s)) {
        return feed_fehler($url, $code === 200 || $code === 404 ? 'ARD Sounds kennt diese Sendung nicht.' : 'ARD Sounds ist gerade nicht erreichbar.');
    }
    $out = [];
    foreach (($s['items']['nodes'] ?? []) as $n) {
        if (!is_array($n)) continue;
        $audio = null;
        foreach (($n['audios'] ?? []) as $a) if (is_array($a) && !empty($a['url'])) { $audio = ['url' => (string)$a['url'], 'art' => 'audio', 'typ' => strtolower((string)($a['mimeType'] ?? 'audio/mpeg'))]; break; }
        $t = strtotime((string)($n['publishDate'] ?? ''));
        $out[] = [
            'titel' => text((string)($n['title'] ?? ''), 300),
            'link'  => (string)($n['sharingUrl'] ?? $n['url'] ?? ''),
            'datum' => $t ? gmdate('c', $t) : null,
            'text'  => text((string)($n['summary'] ?? $n['synopsis'] ?? ''), 700),
            'bild'  => ard_bild($n['image'] ?? null),
            'autor' => '', 'video' => null, 'medien' => $audio,
        ];
    }
    $d = ['status' => 'ok', 'url' => $url, 'titel' => text((string)($s['title'] ?? ''), 120), 'seite' => (string)($s['sharingUrl'] ?? $url),
          'bild' => ard_bild($s['image'] ?? null), 'abgerufen' => gmdate('c'), 'eintraege' => $out];
    @file_put_contents(puffer_datei('feed', $url), als_json($d), LOCK_EX);
    return $d;
}

// ---------- Startplan Raumfahrt (#42): Launch Library 2 (The Space Devs), JSON ohne Schlüssel ------------
// Frei nutzbar mit Quellenangabe; Gratis-Stufe 15 Abrufe/Stunde je Server → Puffer 30 Minuten (ll2_url → puffer_feed).
// Ein Eintrag je Tag: „Raketenstarts – die nächsten N“ als Liste (Zeit in UTC). Kein Scraping, nur die offene API.
function ll2_url(string $u): bool { return (bool)preg_match('#^https://ll\.thespacedevs\.com/2\.[0-9]\.[0-9]/launch/upcoming/?(\?[A-Za-z0-9=&_]*)?$#', $u); }
function ll2_feed(string $url, string $body): ?array {
    $j = json_decode($body, true);
    if (!is_array($j) || !isset($j['results']) || !is_array($j['results'])) return null;
    $zeilen = []; $bild = '';
    foreach (array_slice($j['results'], 0, 15) as $l) {
        if (!is_array($l)) continue;
        $t = strtotime((string)($l['net'] ?? '')); if (!$t) continue;
        $status = (string)($l['status']['abbrev'] ?? '');
        $anbieter = (string)($l['launch_service_provider']['name'] ?? '');
        $ort = (string)($l['pad']['location']['name'] ?? $l['pad']['name'] ?? '');
        $zeilen[] = '• ' . gmdate('d.m. H:i', $t) . ' UTC – ' . text((string)($l['name'] ?? ''), 140)
            . ($anbieter !== '' ? ' (' . text($anbieter, 60) . ')' : '') . ($ort !== '' ? ' · ' . text($ort, 80) : '') . ($status !== '' ? ' · ' . text($status, 12) : '');
        if ($bild === '' && is_string($l['image'] ?? null) && preg_match('#^https://#', $l['image'])) $bild = $l['image'];
    }
    if (!$zeilen) return null;
    $tag = gmdate('Y-m-d');
    return ['titel' => 'Raketenstarts (Launch Library 2)', 'seite' => 'https://thespacedevs.com/llapi', 'eintraege' => [[
        'titel' => 'Raketenstarts – die nächsten ' . count($zeilen), 'link' => 'https://thespacedevs.com/llapi#' . $tag,
        'datum' => $tag . 'T00:01:00Z', 'text' => implode("\n", $zeilen) . "\n\nDaten: Launch Library 2 · The Space Devs",
        'bild' => $bild, 'autor' => 'The Space Devs', 'video' => null, 'medien' => null]]];
}

// ---------- #99: YouTube-Ausweichweg, wenn der Feed-Dienst 404 meldet -----------------
// YouTubes Feed-Dienst (feeds/videos.xml) fällt immer wieder stundenweise für alle Kanäle aus. Dann lesen wir die
// Kanalseite (/channel/<id>/videos, gleicher Zustimmungs-Cookie wie bei der Handle-Auflösung) und bauen daraus Einträge.
const YT_AUSWEICH_MELDUNG = 'YouTube antwortet gerade nicht – KOMPASS versucht es später wieder.';
function yt_kanal_id(string $url): ?string {
    $p = parse_url($url);
    $host = strtolower($p['host'] ?? '');
    if (!($host === 'www.youtube.com' || $host === 'youtube.com' || (TESTMODUS && $host === '127.0.0.1'))) return null;
    if (($p['path'] ?? '') !== '/feeds/videos.xml') return null;
    parse_str((string)($p['query'] ?? ''), $q);
    $id = (string)($q['channel_id'] ?? '');
    return preg_match('/^UC[\w-]{22}$/', $id) ? $id : null;
}
function yt_seite_url(string $url, string $id): string {
    $p = parse_url($url);
    $wurzel = TESTMODUS && ($p['host'] ?? '') === '127.0.0.1' ? 'http://127.0.0.1:' . ($p['port'] ?? 80) : 'https://www.youtube.com';
    return $wurzel . '/channel/' . $id . '/videos';
}
function yt_braucht_ausweich(string $url, array $h): bool {
    return yt_kanal_id($url) !== null && ($h[0] !== 200 || $h[1] === '' || !ist_feed($h[1]));
}
/** „vor 3 Tagen“ / „3 days ago“ / „Live gestreamt vor 2 Stunden“ → ungefährer Zeitpunkt (Unix), sonst null. */
function yt_relativ(string $t): ?int {
    $t = mb_strtolower(trim($t));
    if (!preg_match('/(\d+)\s*([a-zäöü]+)/u', $t, $m)) return null;
    $n = (int)$m[1]; $e = $m[2];
    $einheiten = ['sek' => 1, 'second' => 1, 'min' => 60, 'stund' => 3600, 'hour' => 3600, 'tag' => 86400, 'day' => 86400,
                  'woch' => 604800, 'week' => 604800, 'monat' => 2592000, 'month' => 2592000, 'jahr' => 31536000, 'year' => 31536000];
    foreach ($einheiten as $k => $sek) if (str_starts_with($e, $k)) return time() - $n * $sek;
    return null;
}
function yt_text($v): string {
    if (is_string($v)) return $v;
    if (!is_array($v)) return '';
    if (isset($v['simpleText'])) return (string)$v['simpleText'];
    if (isset($v['content']) && is_string($v['content'])) return $v['content'];
    if (isset($v['runs']) && is_array($v['runs'])) return implode('', array_map(fn($r) => (string)($r['text'] ?? ''), $v['runs']));
    return '';
}
/** Videos aus ytInitialData sammeln: ältere Seiten „videoRenderer“, neuere „lockupViewModel“. */
function yt_videos_sammeln($n, array &$out): void {
    if (!is_array($n) || count($out) >= 30) return;
    if (isset($n['videoRenderer']['videoId'])) {
        $v = $n['videoRenderer'];
        $out[] = ['id' => (string)$v['videoId'], 'titel' => yt_text($v['title'] ?? ''), 'zeit' => yt_text($v['publishedTimeText'] ?? ''),
                  'text' => yt_text($v['descriptionSnippet'] ?? '')];
        return;
    }
    if (isset($n['lockupViewModel']['contentId']) && str_contains((string)($n['lockupViewModel']['contentType'] ?? 'VIDEO'), 'VIDEO')) {
        $v = $n['lockupViewModel']; $md = $v['metadata']['lockupMetadataViewModel'] ?? [];
        $teile = [];
        foreach (($md['metadata']['contentMetadataViewModel']['metadataRows'] ?? []) as $zeile)
            foreach (($zeile['metadataParts'] ?? []) as $teil) $teile[] = yt_text($teil['text'] ?? '');
        $zeit = '';
        foreach ($teile as $t) if (yt_relativ($t) !== null) { $zeit = $t; break; }
        $out[] = ['id' => (string)$v['contentId'], 'titel' => yt_text($md['title'] ?? ''), 'zeit' => $zeit, 'text' => ''];
        return;
    }
    foreach ($n as $k => $kind) { if (is_array($kind)) yt_videos_sammeln($kind, $out); if (count($out) >= 30) return; }
}
/** Kanalseite → ['titel', 'seite', 'eintraege'] wie lies_feed, oder null. */
function yt_seite_lesen(string $html, string $id): ?array {
    // ohne Regex über die ganze Seite (1–2 MB sprengen sonst die PCRE-Grenze): Anfang suchen, Ende „};</script>“
    $daten = null;
    if (preg_match('/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*\{/', $html, $m, PREG_OFFSET_CAPTURE)) {
        $a = $m[0][1] + strlen($m[0][0]) - 1;
        $e = strpos($html, '</script>', $a);
        if ($e !== false) {
            $json = rtrim(substr($html, $a, $e - $a));
            $json = rtrim($json, ';');
            $daten = json_decode($json, true);
        }
    }
    $roh = [];
    if (is_array($daten)) yt_videos_sammeln($daten['contents'] ?? $daten, $roh);
    if (!$roh) return null;
    $titel = is_array($daten) ? (string)($daten['metadata']['channelMetadataRenderer']['title'] ?? '') : '';
    if ($titel === '' && preg_match('/<meta\s+property="og:title"\s+content="([^"]*)"/i', $html, $m)) $titel = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $seite = 'https://www.youtube.com/channel/' . $id;
    $out = []; $gesehen = []; $vorige = time();
    foreach ($roh as $v) {
        if (!preg_match('/^[\w-]{11}$/', $v['id']) || isset($gesehen[$v['id']])) continue;
        $gesehen[$v['id']] = true;
        // Datum steht nur relativ da („vor 3 Tagen“) – ungefähr; ohne Angabe knapp hinter dem vorigen Video, damit die Reihenfolge bleibt
        $t = yt_relativ($v['zeit']) ?? ($vorige - 60);
        $t = min($t, $vorige); $vorige = $t;
        $out[] = ['titel' => text($v['titel'], 300), 'link' => 'https://www.youtube.com/watch?v=' . $v['id'], 'datum' => gmdate('c', $t),
                  'text' => text($v['text'], 700), 'bild' => 'https://i.ytimg.com/vi/' . $v['id'] . '/hqdefault.jpg',
                  'autor' => text($titel, 80), 'video' => $v['id'], 'medien' => null, 'ungefaehr' => true];
    }
    return $out ? ['titel' => text($titel, 120), 'seite' => $seite, 'eintraege' => $out] : null;
}

// ---------- Feed: Abruf → Antwort -----------------------------------------
function feed_ergebnis(string $url, array $h, ?array $seiteH = null): array {
    [$code, $body, , $end, $gekuerzt] = $h;
    if (($id = yt_kanal_id($url)) && yt_braucht_ausweich($url, $h)) {  // #99
        if ($seiteH === null) { bremse_buchen(1); $seiteH = hole(yt_seite_url($url, $id)); }
        $f = $seiteH[0] === 200 && $seiteH[1] !== '' ? yt_seite_lesen($seiteH[1], $id) : null;
        if (!$f) return feed_fehler($url, YT_AUSWEICH_MELDUNG);
        $d = ['status' => 'ok', 'url' => $url, 'titel' => $f['titel'], 'seite' => $f['seite'], 'abgerufen' => gmdate('c'), 'eintraege' => $f['eintraege'], 'ausweich' => 'kanalseite'];
        @file_put_contents(puffer_datei('feed', $url), als_json($d), LOCK_EX);
        return $d;
    }
    if ($code === 200 && ll2_url($url)) {  // #42: Startplan als JSON
        $f = ll2_feed($url, (string)$body);
        if (!$f) return feed_fehler($url, 'Startplan konnte nicht gelesen werden.');
        $d = ['status' => 'ok', 'url' => $url, 'titel' => $f['titel'], 'seite' => $f['seite'], 'abgerufen' => gmdate('c'), 'eintraege' => $f['eintraege']];
        @file_put_contents(puffer_datei('feed', $url), als_json($d), LOCK_EX);
        return $d;
    }
    if ($code !== 200 || $body === '' || !ist_feed($body)) {
        $m = $code === 0 ? 'Adresse nicht erlaubt oder nicht erreichbar.' : ($code === -1 ? 'Der Feed ist zu groß.'
            : ($code === 200 ? 'Unter dieser Adresse liegt kein Feed.' : 'Quelle antwortet mit ' . $code . '.'));
        return feed_fehler($url, $m);
    }
    $f = lies_feed($body, $end);
    if (!$f) return feed_fehler($url, 'Feed konnte nicht gelesen werden.');
    $d = ['status' => 'ok', 'url' => $url, 'titel' => $f['titel'], 'seite' => $f['seite'], 'abgerufen' => gmdate('c'), 'eintraege' => $f['eintraege']];
    if (!empty($f['sprache'])) $d['sprache'] = $f['sprache'];  // #69
    if ($gekuerzt) $d['gekuerzt'] = true; // langer Feed: nur die ersten Einträge geladen
    @file_put_contents(puffer_datei('feed', $url), als_json($d), LOCK_EX);
    return $d;
}
/** Fehler 5 Minuten merken: eine hängende Quelle bremst nicht jeden Abruf erneut aus und zählt nicht immer wieder. */
const FEHLER_PUFFER = 300;
function feed_fehler(string $url, string $meldung): array {
    $d = ['status' => 'fehler', 'meldung' => $meldung];
    @file_put_contents(puffer_datei('fehl', $url), als_json($d), LOCK_EX);
    return $d;
}
/** Frischer Puffer (Feed oder gemerkter Fehler) – sonst null. */
function puffer_feed(string $url): ?array {
    foreach ([['feed', ll2_url($url) ? 1800 : 600], ['fehl', FEHLER_PUFFER]] as [$art, $sek]) {
        $p = puffer_datei($art, $url);
        if (puffer_frisch($p, $sek) && is_array($d = json_decode((string)file_get_contents($p), true))) return $art === 'fehl' ? (puffer_alt($url) ?? $d) : $d;
    }
    return null;
}
/** Älterer Pufferstand als Rückfall, wenn die Quelle gerade nicht antwortet. */
function puffer_alt(string $url): ?array {
    $p = puffer_datei('feed', $url);
    if (!is_readable($p)) return null;
    $d = json_decode((string)file_get_contents($p), true);
    return is_array($d) ? $d : null;
}

// ---------- Ablauf -------------------------------------------------------
$aktion = (string)($_GET['aktion'] ?? 'feed');
if (random_int(1, 40) === 1) {
    foreach (glob(puffer_ordner() . '/rss-*.json') ?: [] as $alt) if (filemtime($alt) < time() - 172800) @unlink($alt);
}

// ---------- Aktion: Sammelabruf --------------------------------------------
// POST rss.php?aktion=sammel  { "urls": [ … höchstens 30 … ] }
//   → { status, feeds: { "<Adresse wie gesendet>": <Antwort wie aktion=feed> | {status:"fehler"|"limit", meldung} }, abgerufen }
// Gepufferte Feeds kommen sofort und zählen nicht gegen die Bremse; der Rest wird parallel geholt.
if ($aktion === 'sammel') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') raus(405, ['status' => 'fehler', 'meldung' => 'Nur POST.']);
    $ein = json_decode((string)file_get_contents('php://input', false, null, 0, 200_000), true);
    $liste = is_array($ein) && is_array($ein['urls'] ?? null) ? array_values(array_unique(array_filter($ein['urls'], 'is_string'))) : [];
    if (!$liste) raus(400, ['status' => 'fehler', 'meldung' => 'Keine Adressen angegeben.']);
    if (count($liste) > SAMMEL_MAX) raus(400, ['status' => 'fehler', 'meldung' => 'Höchstens ' . SAMMEL_MAX . ' Adressen je Abruf.']);
    $feeds = []; $holen = [];
    foreach ($liste as $roh) {
        $u = norm_url($roh);
        if ($u === '') { $feeds[$roh] = ['status' => 'fehler', 'meldung' => 'Keine gültige Adresse.']; continue; }
        if ($d = puffer_feed($u)) { $feeds[$roh] = $d; continue; }
        $holen[$roh] = $u;
    }
    $jetzt = array_slice($holen, 0, bremse_rest(), true);
    foreach (array_diff_key($holen, $jetzt) as $roh => $u) {
        $feeds[$roh] = puffer_alt($u) ?? ['status' => 'limit', 'meldung' => 'Zu viele Abrufe. Bitte später noch einmal.'];
    }
    bremse_buchen(count($jetzt));
    foreach ($jetzt as $roh => $u) {
        if (!($urn = ard_urn($u))) continue;
        $d = ard_feed($u, $urn);
        $feeds[$roh] = $d['status'] === 'ok' ? $d : (puffer_alt($u) ?? $d);
        unset($jetzt[$roh]);
    }
    $schluessel = array_keys($jetzt);
    $antworten = hole_viele(array_values($jetzt), 6);
    // #99: YouTube-Feeds ohne Antwort – Kanalseiten gemeinsam (parallel) als Ausweichweg holen
    $ausweich = [];
    foreach ($antworten as $i => $h) { $u = $jetzt[$schluessel[$i]]; if (yt_braucht_ausweich($u, $h)) $ausweich[$i] = yt_seite_url($u, (string)yt_kanal_id($u)); }
    $seiten = [];
    if ($ausweich) { bremse_buchen(count($ausweich)); $seiten = array_combine(array_keys($ausweich), hole_viele(array_values($ausweich), 8)); }
    foreach ($antworten as $i => $h) {
        $roh = $schluessel[$i]; $u = $jetzt[$roh];
        $d = feed_ergebnis($u, $h, $seiten[$i] ?? null);
        if ($d['status'] !== 'ok' && ($alt = puffer_alt($u))) $d = $alt;
        $feeds[$roh] = $d;
    }
    raus(200, ['status' => 'ok', 'feeds' => (object)$feeds, 'abgerufen' => count($jetzt)]);
}

// ---------- Einzelaufrufe: Puffer zuerst, dann Bremse --------------------------
$url = norm_url((string)($_GET['url'] ?? ''));
if ($url === '') raus(400, ['status' => 'fehler', 'meldung' => 'Keine Adresse angegeben.']);
$pufferDatei = puffer_datei($aktion, $url);
if (puffer_frisch($pufferDatei, $aktion === 'feed' ? (ll2_url($url) ? 1800 : 600) : 86400)) {
    header('Cache-Control: public, max-age=300');
    readfile($pufferDatei);
    exit;
}
if ($aktion === 'feed' && ($d = puffer_feed($url))) raus($d['status'] === 'ok' ? 200 : 502, $d, $d['status'] === 'ok' ? 300 : 0);
if (bremse_rest() < 1) raus(429, ['status' => 'limit', 'meldung' => 'Zu viele Abrufe. Bitte später noch einmal.']);
bremse_buchen(1);

// ---------- Aktion: Feed lesen ---------------------------------------------
if ($aktion === 'feed') {
    $d = ($urn = ard_urn($url)) ? ard_feed($url, $urn) : feed_ergebnis($url, hole($url));
    if ($d['status'] !== 'ok') {
        if ($alt = puffer_alt($url)) raus(200, $alt, 60);
        raus(502, $d);
    }
    raus(200, $d, 300);
}

// ---------- Aktion: Video/Audio einer Seite finden ---------------------------
// Für Feed-Einträge ohne Anhang (z. B. Sendungsseiten): schema.org VideoObject/AudioObject (contentUrl),
// og:video, <video>/<source>. Liefert nur die Adresse; abgespielt wird direkt vom Gerät.
if ($aktion === 'medien') {
    $suche = function (string $u) {
        [$code, $body, , $end] = hole($u);
        if ($code !== 200 || $body === '') return [null, '', '', ''];
        $html = substr($body, 0, 2_000_000);
        $kand = [];
        if (preg_match_all('#"contentUrl"\s*:\s*"([^"]+)"#i', $html, $m)) foreach ($m[1] as $x) $kand[] = stripcslashes($x);
        if (preg_match_all('#<meta[^>]+property=["\']og:video(?::secure_url|:url)?["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m)) foreach ($m[1] as $x) $kand[] = $x;
        // #85: auch <meta content="…" property="og:video"> (Reihenfolge der Attribute umgekehrt)
        if (preg_match_all('#<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:video(?::secure_url|:url)?["\']#i', $html, $m)) foreach ($m[1] as $x) $kand[] = $x;
        if (preg_match_all('#<(?:video|source|audio)\b[^>]*\bsrc=["\']([^"\']+)["\']#i', $html, $m)) foreach ($m[1] as $x) $kand[] = $x;
        $flach = str_replace(['\\/', '&quot;', '&#34;'], ['/', '"', '"'], $html);
        if (preg_match_all('#https?://[^"\'\s<>]+?\.(?:mp4|m3u8|mp3)(?:\?[^"\'\s<>]*)?#i', $flach, $m)) foreach ($m[0] as $x) $kand[] = $x;
        $best = null;
        foreach ($kand as $x) {
            $x = absolut($end, html_entity_decode($x, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if (!preg_match('#^https?://#i', $x)) continue;
            if (preg_match('#\.(mp4|m4v|webm)(\?|$)#i', $x)) { $best = ['url' => $x, 'art' => 'video']; break; }
            if (!$best && preg_match('#\.m3u8(\?|$)#i', $x)) $best = ['url' => $x, 'art' => 'video'];
            if (!$best && preg_match('#\.(mp3|m4a|aac|ogg)(\?|$)#i', $x)) $best = ['url' => $x, 'art' => 'audio'];
        }
        $bild = preg_match('#<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m) ? absolut($end, $m[1]) : '';
        // Sendungsseite ohne Video: erste verlinkte Videoseite derselben Website
        $weiter = '';
        if (!$best && preg_match('#href=["\']([^"\']*video-\d+[^"\']*\.html)["\']#i', $html, $m)) $weiter = absolut($end, $m[1]);
        return [$best, $bild, $weiter, $end];
    };
    [$best, $bild, $weiter, $end] = $suche($url);
    if (!$best && $weiter && parse_url($weiter, PHP_URL_HOST) === parse_url($end, PHP_URL_HOST)) {
        [$best, $bild2] = $suche($weiter);
        $bild = $bild ?: $bild2;
    }
    // tagesschau.de: Sendungsseiten laden das Video per Skript – die offene JSON-Fassung (api2u) enthält die Video-Adressen
    if (!$best && preg_match('#^https?://(www\.)?tagesschau\.de(/[^?#]+)\.html#i', $end, $m) && !str_starts_with($m[2], '/api2u/')) {
        [$best, $bild2] = $suche('https://www.tagesschau.de/api2u' . $m[2] . '.json');
        $bild = $bild ?: $bild2;
    }
    if (!$best) raus(200, ['status' => 'leer']);
    $d = ['status' => 'ok', 'url' => $best['url'], 'art' => $best['art'], 'bild' => $bild];
    @file_put_contents($pufferDatei, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    raus(200, $d, 3600);
}

// ---------- Aktion: Feed finden --------------------------------------------
if ($aktion !== 'finden') raus(400, ['status' => 'fehler']);
$gefunden = []; $name = ''; $bild = ''; $seite = $url;
$p = parse_url($url);
$host = strtolower(preg_replace('#^(www|m)\.#', '', (string)($p['host'] ?? '')));
$istYt = $host === 'youtube.com' || $host === 'youtu.be';
$ytFeed = fn(string $q) => 'https://www.youtube.com/feeds/videos.xml?' . $q;

// PeerTube (M008/A007): Kanal /c/<name> bzw. /video-channels/<name>, Konto /a/<name> bzw. /accounts/<name>
// → https://<instanz>/feeds/videos.xml?videoChannelName=<name> bzw. ?accountName=<name>. Geprüft wird unten wie jeder Feed.
$peertube = null;
if (!$istYt && preg_match('~^/(c|video-channels|a|accounts)/([\w.\-]+(?:@[\w.\-]+)?)/?~', (string)($p['path'] ?? ''), $m)) {
    $peertube = ($p['scheme'] ?? 'https') . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . '/feeds/videos.xml?' . (in_array($m[1], ['c', 'video-channels'], true) ? 'videoChannelName=' : 'accountName=') . rawurlencode($m[2]);
}
if ($istYt && preg_match('#^/channel/(UC[\w-]{22})#', (string)($p['path'] ?? ''), $m)) {
    $gefunden[] = ['url' => $ytFeed('channel_id=' . $m[1]), 'titel' => '', 'art' => 'youtube'];
}
if ($istYt && preg_match('#(?:^|&)list=([\w-]{10,})#', (string)($p['query'] ?? ''), $m)) {
    $gefunden[] = ['url' => $ytFeed('playlist_id=' . $m[1]), 'titel' => 'Playlist', 'art' => 'youtube'];
}

if (!ard_urn($url) && ($folge = ard_folge($url))) {
    $urn = ard_folge_zu_sendung($folge);
    if (!$urn) raus(200, ['status' => 'leer', 'meldung' => 'Zu dieser Folge habe ich bei ARD Sounds keine Sendung gefunden.', 'name' => '']);
    $url = 'https://www.ardsounds.de/show/' . $urn;
}
if ($urn = ard_urn($url)) {
    $kanon = 'https://www.ardsounds.de/show/' . $urn;
    $d = ard_feed($kanon, $urn);
    if ($d['status'] !== 'ok') raus(200, ['status' => 'leer', 'meldung' => $d['meldung'], 'name' => '']);
    $d = ['status' => 'ok', 'name' => $d['titel'], 'bild' => $d['bild'], 'seite' => $d['seite'], 'gefunden' => [['url' => $kanon, 'titel' => $d['titel'], 'art' => 'rss']]];
    @file_put_contents($pufferDatei, als_json($d), LOCK_EX);
    raus(200, $d, 3600);
}
[$code, $body, $typ, $end] = hole($url);
if ($code === 200 && $body !== '') {
    if (ist_feed($body)) {
        $f = lies_feed($body, $end);
        if ($f) { $gefunden[] = ['url' => $end, 'titel' => $f['titel'], 'art' => str_contains($end, 'youtube.com/feeds/') ? 'youtube' : 'rss']; $name = $f['titel']; $seite = $f['seite'] ?: $end; }
    } else {
        $html = substr($body, 0, 1_500_000);
        // Website: Name der Seite; YouTube: Name des Kanals (og:site_name wäre dort nur „YouTube“)
        if (!$istYt && preg_match('#<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']*)["\']#i', $html, $m)) $name = text($m[1], 120);
        if ($name === '' && preg_match('#<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']*)["\']#i', $html, $m)) $name = text($m[1], 120);
        if ($name === '' && preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) $name = text($m[1], 120);
        if (preg_match('#<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m)) $bild = absolut($end, $m[1]);
        if ($istYt) {
            $id = '';
            if (preg_match('#"(?:externalId|channelId)":"(UC[\w-]{22})"#', $html, $m)) $id = $m[1];
            elseif (preg_match('#channel_id=(UC[\w-]{22})#', $html, $m)) $id = $m[1];
            elseif (preg_match('#youtube\.com/channel/(UC[\w-]{22})#', $html, $m)) $id = $m[1];
            if ($id && !array_filter($gefunden, fn($g) => str_contains($g['url'], $id))) $gefunden[] = ['url' => $ytFeed('channel_id=' . $id), 'titel' => $name, 'art' => 'youtube'];
        } else {
            if (preg_match_all('#<link\b[^>]*>#i', $html, $alle)) {
                foreach ($alle[0] as $tag) {
                    if (!preg_match('#\brel=["\']?[^"\'>]*alternate#i', $tag)) continue;
                    if (!preg_match('#\btype=["\']?(application/(rss|atom|rdf)\+xml|application/feed\+json|text/xml)#i', $tag) || stripos($tag, 'oembed') !== false) continue;
                    if (!preg_match('#\bhref=(?:"([^"]+)"|\'([^\']+)\'|([^\s>]+))#i', $tag, $hm)) continue;
                    $h = [0, $hm[1] ?: ($hm[2] ?? '') ?: ($hm[3] ?? '')];
                    $t = preg_match('#\btitle=["\']([^"\']*)["\']#i', $tag, $tt) ? text($tt[1], 120) : '';
                    $u = absolut($end, $h[1]);
                    if (!array_filter($gefunden, fn($g) => $g['url'] === $u)) $gefunden[] = ['url' => $u, 'titel' => $t, 'art' => 'rss'];
                }
            }
            if ($bild === '' && preg_match('#<link[^>]+rel=["\'][^"\']*(apple-touch-icon|icon)[^"\']*["\'][^>]*href=["\']([^"\']+)["\']#i', $html, $m)) $bild = absolut($end, $m[2]);
        }
    }
}
if ($peertube && !array_filter($gefunden, fn($g) => str_contains($g['url'], '/feeds/videos.'))) {
    [$cp, $bp, , $ep] = hole($peertube);
    if ($cp === 200 && ist_feed($bp) && ($f = lies_feed($bp, $ep))) {
        array_unshift($gefunden, ['url' => $peertube, 'titel' => $f['titel'], 'art' => 'rss']);
        if ($name === '' || $name === 'PeerTube') $name = $f['titel'];
    }
}
// Nichts angekündigt? Übliche Feed-Adressen probieren
if (!$gefunden && !$istYt && $code === 200) {
    $b = parse_url($end);
    $wurzel = ($b['scheme'] ?? 'https') . '://' . ($b['host'] ?? '');
    // parallel statt nacheinander; der erste Treffer in dieser Reihenfolge gewinnt
    $versuche = array_map(fn($v) => $wurzel . $v, ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feed/', '/rss/']);
    foreach (hole_viele($versuche) as [$c2, $b2, , $e2]) {
        if ($c2 === 200 && ist_feed($b2) && ($f = lies_feed($b2, $e2))) { $gefunden[] = ['url' => $e2, 'titel' => $f['titel'], 'art' => 'rss']; break; }
    }
}
// Kommentar-Feeds nach hinten
usort($gefunden, fn($a, $b) => (int)(stripos($a['url'], 'comment') !== false) <=> (int)(stripos($b['url'], 'comment') !== false));
if (!$gefunden) raus(200, ['status' => 'leer', 'meldung' => $code === 0 ? 'Adresse nicht erlaubt oder nicht erreichbar.' : 'Hier wurde kein Feed gefunden.', 'name' => $name]);
$d = ['status' => 'ok', 'name' => $name, 'bild' => $bild, 'seite' => $seite, 'gefunden' => array_slice($gefunden, 0, 8)];
@file_put_contents($pufferDatei, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
raus(200, $d, 3600);
