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
        $c = $p !== '' ? (include $p) : null;
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

// Zero Ledger: Pings annehmen? config.php „ping_annehmen“ (true/false) geht vor OL_PING
function ol_ping_an(): bool {
    $c = ol_konfig();
    return array_key_exists('ping_annehmen', $c) ? (bool)$c['ping_annehmen'] : OL_PING;
}
