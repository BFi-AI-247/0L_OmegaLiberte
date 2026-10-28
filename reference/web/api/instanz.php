<?php
// SPDX-License-Identifier: AGPL-3.0-only
// instanz.php – kleines Skript für die Seite: bindet GoatCounter ein, wenn die Instanz einen Zähler hat
// (OL_ZAEHLER in _instanz.php oder „goatcounter“ in config.php). Sonst leer: nichts wird gezählt oder nachgeladen.
// Setzt window.OL_ZAEHLER, damit der Datenschutztext den Zähler nur nennt, wenn er läuft.
declare(strict_types=1);
require __DIR__ . '/_instanz.php';

header('Content-Type: text/javascript; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('X-Content-Type-Options: nosniff');

// #9: Instanz-Ping des Betreibers (nur mit 'zero_ledger_instanz' => true), nach der Antwort an den Browser
register_shutdown_function(function () { if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); ol_instanz_ping(); });
$gc = ol_zaehler();
if (!preg_match('#^https://[a-z0-9-]+\.goatcounter\.com/count$#', $gc)) { echo "/* kein Zähler */\n"; exit; }
echo 'window.OL_ZAEHLER=true;(function(){var s=document.createElement("script");s.async=true;s.src="https://gc.zgo.at/count.js";'
   . 's.setAttribute("data-goatcounter",' . json_encode($gc, JSON_UNESCAPED_SLASHES) . ');document.body.appendChild(s);})();' . "\n";
