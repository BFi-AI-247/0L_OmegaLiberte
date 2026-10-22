<?php
// SPDX-License-Identifier: AGPL-3.0-only
// _instanz.php – alles, was diese Installation von anderen unterscheidet (nicht direkt aufrufen)
// Eine andere Instanz ändert nur den Block „Instanz“ unten (oder setzt die Werte in config.php).
// Konfiguration: Umgebungsvariable OMEGALIBERTE_CONFIG (Pfad zu einer PHP-Datei, die ein Array zurückgibt),
// sonst OL_KONFIG. Ohne Konfiguration läuft alles, was keinen Schlüssel braucht.
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(404); exit; }

// ---------- Instanz ----------
const OL_KONFIG   = __DIR__ . '/../../config.php';                    // config.php NEBEN dem Web-Ordner
const OL_DATEN    = '';                                                // Puffer und Zähler; '' = Temp-Ordner
const OL_HERKUNFT = [];                                                // zusätzlich zur eigenen Seite
const OL_UA       = 'Mozilla/5.0 (compatible; OmegaLiberte-Feed/1; +https://github.com/BFi-AI-247/0L_OmegaLiberte)';
const OL_ZAEHLER  = '';                                                // GoatCounter; '' = aus
const OL_PING     = false;                                            // api/ping.php nimmt Installations-Pings an (Zero Ledger)
// ---------- Ende Instanz ----------

// Umgebung: getenv (CLI, mod_php) oder $_SERVER (CGI/FPM, auch REDIRECT_… nach SetEnv in .htaccess)
function ol_env(string $name): string {
    $w = getenv($name);
    if (!is_string($w) || $w === '') $w = $_SERVER[$name] ?? $_SERVER['REDIRECT_' . $name] ?? '';
    return (string)$w;
}

function ol_konfig_pfad(): string {
    $env = ol_env('OMEGALIBERTE_CONFIG');
    if ($env !== '') return is_readable($env) ? $env : '';
    return is_readable(OL_KONFIG) ? OL_KONFIG : '';
}

function ol_konfig(): array {
    static $cfg = null;
    if ($cfg === null) {
        $p = ol_konfig_pfad();
        $c = null;
        if ($p !== '') {
            // Eine fehlerhafte config.php (z. B. fehlendes Komma) darf nicht alle Endpunkte lahmlegen:
            // dann gelten die Standardwerte, und health.php meldet den Fehler.
            try { $c = include $p; }
            catch (\Throwable $e) { $GLOBALS['OL_KONFIG_FEHLER'] = 'config.php: ' . $e->getMessage() . ' (Zeile ' . $e->getLine() . ')'; error_log('KOMPASS ' . $GLOBALS['OL_KONFIG_FEHLER']); }
        }
        $cfg = is_array($c) ? $c : [];
    }
    return $cfg;
}

// Puffer und Zähler: data_dir aus config.php, sonst OMEGALIBERTE_DATA, sonst OL_DATEN, sonst Temp-Ordner.
// Nie im Web-Ordner (Puffer und Zähler-Hashes sollen nicht öffentlich abrufbar sein).
function ol_datenordner(): string {
    $d = (string)(ol_konfig()['data_dir'] ?? '');
    if ($d === '') $d = ol_env('OMEGALIBERTE_DATA');
    if ($d === '') $d = OL_DATEN;
    if ($d === '') $d = sys_get_temp_dir() . '/omegaliberte';
    return rtrim($d, '/');
}

// Erlaubte Herkunft (Origin) für POST-Endpunkte: die eigene Seite, dazu allowed_origins aus config.php
// (alter Name: erlaubte_herkunft), sonst OL_HERKUNFT.
function ol_erlaubte_herkunft(array $cfg): array {
    $liste = [];
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    if ($host !== '' && preg_match('/^[a-z0-9.\-]+(:\d+)?$/i', $host)) { $liste[] = 'https://' . $host; $liste[] = 'http://' . $host; }
    foreach ((array)($cfg['allowed_origins'] ?? $cfg['erlaubte_herkunft'] ?? OL_HERKUNFT) as $o) $liste[] = rtrim((string)$o, '/');
    return $liste;
}

function ol_user_agent(): string {
    $ua = (string)(ol_konfig()['user_agent'] ?? '');
    return $ua !== '' ? $ua : OL_UA;
}

function ol_zaehler(): string {
    return (string)(ol_konfig()['goatcounter'] ?? OL_ZAEHLER);
}

// #9 Zero Ledger – Instanz-Ping des Betreibers (getrennt vom freiwilligen Nutzer-Ping in der App).
// Nur wenn der Betreiber es in config.php einschaltet: 'zero_ledger_instanz' => true (Ziel: 'zero_ledger', Standard Referenz-Ledger).
// Gesendet werden nur Instanz-Adresse (Host + Pfad) und App-Version – einmal, danach höchstens alle 30 Tage ein Lebenszeichen.
// Ausgelöst von api/instanz.php (wird mit jeder Seite geladen); der Abruf läuft nach der Antwort an den Browser.
const OL_LEDGER = 'https://digifil.de/kompass/api/ping.php';
function ol_instanz_ping(): void {
    $c = ol_konfig();
    if (empty($c['zero_ledger_instanz'])) return;
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $pfad = strtolower(preg_replace('#/api/[^/]*$#', '', (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH)));
    if (!preg_match('/^[a-z0-9.-]+(:\d{1,5})?$/', $host)) return;
    // Marke je Instanz: Live und Vorschau teilen sich Datenordner und config.php, dürfen sich aber nicht gegenseitig sperren
    $marke = ol_datenordner() . '/ping-instanz-' . substr(md5($host . rtrim($pfad, '/')), 0, 12) . '.txt';
    if (is_readable($marke) && filemtime($marke) > time() - 30 * 86400) return;
    $basis = @file_get_contents(__DIR__ . '/../kern/basis.js', false, null, 0, 4000) ?: '';
    $version = preg_match("/const VERSION = '(v[\d.]+)'/", $basis, $m) ? $m[1] : 'v0';
    @mkdir(dirname($marke), 0750, true); @touch($marke);   // vorher: auch bei Fehler höchstens ein Versuch je 30 Tage
    $ziel = (string)($c['zero_ledger'] ?? OL_LEDGER);
    if (!preg_match('#^https://#', $ziel) || !function_exists('curl_init')) return;
    $ch = curl_init($ziel);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_HTTPHEADER => ['Content-Type: text/plain'], CURLOPT_USERAGENT => ol_user_agent(),
        CURLOPT_POSTFIELDS => json_encode(['art' => 'instanz', 'version' => $version, 'instanz' => substr($host . rtrim($pfad, '/'), 0, 100)])]);
    curl_exec($ch); curl_close($ch);
}

// Zero Ledger: Pings annehmen? config.php „ping_annehmen“ (true/false) geht vor OL_PING
function ol_ping_an(): bool {
    $c = ol_konfig();
    return array_key_exists('ping_annehmen', $c) ? (bool)$c['ping_annehmen'] : OL_PING;
}
