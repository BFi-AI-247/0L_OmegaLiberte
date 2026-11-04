<?php
// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// _radar.php – Seiten von RADAR 724 lesen (Modul w0-volltext, 03.11.2026)
// Warum: Der Feed der Wiesenzeitung enthält je Meldung nur einen Anriss (2–3 Sätze, RADAR-Regel). Die ganze Meldung
// und das Faktenblatt „Markt am Morgen“ stehen auf der Ausgabeseite. RADAR ist ein Projekt des Betreibers, die Texte
// sind RADARs eigene. Gelesen wird nur radar724.de (feste Adresse), nie eine Adresse aus einer Anfrage.
// Jede Ausgabeseite wird höchstens alle 6 Stunden geholt (Puffer im Datenordner). Keine Nutzerdaten.
// ===================================================================
declare(strict_types=1);

const RADAR_SEITE_PUFFER = 6 * 3600;
const RADAR_SEITE_MAX = 1_000_000;

function radar_testmodus(): bool { return PHP_SAPI === 'cli-server' && getenv('KOMPASS_TEST') === '1' && getenv('KOMPASS_RADAR_BASIS'); }
/** Wurzel von RADAR: https://radar724.de – im Rauchtest ein lokaler Nachbau */
function radar_basis(): string { return radar_testmodus() ? rtrim((string)getenv('KOMPASS_RADAR_BASIS'), '/') : 'https://radar724.de'; }
/** Nur Seiten unter radar_basis() mit harmlosem Pfad */
function radar_url_ok(string $url): bool {
    $b = radar_basis();
    return str_starts_with($url, $b . '/') && (bool)preg_match('~^/[A-Za-z0-9_./-]+$~', substr($url, strlen($b)));
}
function radar_puffer_ordner(): string {
    $p = ol_datenordner() . '/puffer';
    if (!is_dir($p) && !@mkdir($p, 0750, true)) { $p = sys_get_temp_dir() . '/kompass-puffer'; if (!is_dir($p)) @mkdir($p, 0700, true); }
    return $p;
}
/** Seite holen (gepuffert); null bei Fehler – dann gilt der alte Puffer, wenn vorhanden */
function radar_seite(string $url, int $puffer = RADAR_SEITE_PUFFER): ?string {
    if (!radar_url_ok($url)) return null;
    $datei = radar_puffer_ordner() . '/radar-seite-' . md5($url) . '.html';
    if (is_readable($datei) && filemtime($datei) > time() - $puffer) return (string)file_get_contents($datei);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => radar_testmodus() ? CURLPROTO_HTTP | CURLPROTO_HTTPS : CURLPROTO_HTTPS, CURLOPT_USERAGENT => ol_user_agent(), CURLOPT_ENCODING => '']);
    $b = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    if ($code === 200 && is_string($b) && $b !== '' && strlen($b) <= RADAR_SEITE_MAX) { @file_put_contents($datei, $b, LOCK_EX); return $b; }
    @touch($datei);  // Fehlschlag merken, nicht bei jedem Aufruf neu versuchen
    return is_readable($datei) && filesize($datei) > 0 ? (string)file_get_contents($datei) : null;
}
function radar_dom(string $html): ?DOMXPath {
    $d = new DOMDocument();
    libxml_use_internal_errors(true);
    $ok = $d->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    return $ok ? new DOMXPath($d) : null;
}
function radar_text(DOMNode $n): string { return trim((string)preg_replace('/[ \t\r\n\x{00A0}]+/u', ' ', $n->textContent)); }
function radar_klasse(string $k): string { return "contains(concat(' ', normalize-space(@class), ' '), ' $k ')"; }

/** Volle Meldungen einer Ausgabeseite: [ 'artikel-1' => "Absatz\n\nAbsatz", … ] (ohne Quellenzeile) */
function radar_artikel(string $html): array {
    $x = radar_dom($html); if (!$x) return [];
    $out = [];
    foreach ($x->query('//*[starts-with(@id, "artikel-")]') as $el) {
        $absaetze = [];
        foreach ($x->query('.//p', $el) as $p) { $t = radar_text($p); if ($t !== '') $absaetze[] = $t; }
        if ($absaetze) $out[$el->getAttribute('id')] = implode("\n\n", $absaetze);
    }
    return $out;
}

/** Faktenblatt der Ausgabe: Wetterleiste und „Markt am Morgen“, Texte unverändert */
function radar_faktenblatt(string $html): ?array {
    $x = radar_dom($html); if (!$x) return null;
    $leiste = [];
    foreach ($x->query('//section[' . radar_klasse('wetterleiste') . ']/span') as $s) {
        $t = radar_text($s); if ($t === '') continue;
        $name = ''; $st = $x->query('.//strong', $s);
        if ($st->length) { $name = rtrim(radar_text($st->item(0)), ' :'); $t = trim(preg_replace('/^' . preg_quote(radar_text($st->item(0)), '/') . '\s*/u', '', $t)); }
        elseif (preg_match('/^(\S{2,20})\s+(.+)$/u', $t, $m)) { $name = $m[1]; $t = $m[2]; }
        $t = (string)preg_replace('/^[—–-]\s*/u', '', $t);
        $leiste[] = ['name' => $name, 'text' => $t];
    }
    $kurse = [];
    foreach ($x->query('//section[' . radar_klasse('markt') . ']//span[' . radar_klasse('kurs') . ']') as $k) {
        $b = $x->query('.//b', $k)->item(0); if (!$b) continue;
        $name = ''; foreach ($k->childNodes as $c) { if ($c->isSameNode($b)) break; $name .= $c->textContent; }
        $ae = $x->query('.//span[' . radar_klasse('up') . ' or ' . radar_klasse('down') . ']', $k)->item(0);
        $aeText = $ae ? radar_text($ae) : '';
        $teile = preg_split('/\s+—\s+/u', (string)preg_replace('/^[▲▼■]\s*/u', '', $aeText), 2);
        $kurse[] = ['name' => trim((string)preg_replace('/\s+/u', ' ', $name)), 'wert' => radar_text($b),
            'richtung' => $ae ? (str_contains(' ' . $ae->getAttribute('class') . ' ', ' up ') ? 'auf' : 'ab') : '',
            'veraenderung' => $teile[0] ?? '', 'stand' => $teile[1] ?? ''];
    }
    $q = $x->query('//section[' . radar_klasse('markt') . ']/span[' . radar_klasse('source') . ']')->item(0);
    $titel = $x->query('//section[' . radar_klasse('markt') . ']/*[' . radar_klasse('markt-titel') . ']')->item(0);
    if (!$leiste && !$kurse) return null;
    return ['leiste' => $leiste, 'kurse' => $kurse, 'markt_titel' => $titel ? radar_text($titel) : '', 'quellen' => $q ? radar_text($q) : ''];
}
