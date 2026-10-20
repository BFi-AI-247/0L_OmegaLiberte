<?php
// SPDX-License-Identifier: AGPL-3.0-only
// config.example.php – Vorlage für die Konfiguration einer OmegaLiberte-Instanz (Kompass~OmegaLiberte).
// Kopieren nach config.php NEBEN den Ordner web/ (reference/config.php), oder irgendwohin und
// OMEGALIBERTE_CONFIG=/pfad/zu/config.php setzen. Die echte config.php gehört NIE in ein Repo.
// Alles ist optional. Ohne config.php funktionieren Quellen, Lesen, Sync per WebDAV und die eigene KI im Browser.
return [
    // Server-KI (optional). Ohne Schlüssel bringt jede Person ihre eigene KI mit (OpenRouter, eigener Schlüssel, lokal).
    // Mit Schlüssel bieten ai.php (Dialog) und kurator.php (KI-Auswahl) eine Probe über DEINEN Mistral-Zugang an.
    'mistral_key' => '',
    'kompass_fragen_pro_stunde'     => 20,   // Dialog: Fragen je IP-Hash und Stunde
    'kompass_kuratieren_pro_stunde' => 10,   // KI-Auswahl je IP-Hash und Stunde
    'kompass_max_pro_tag'           => 300,  // alle KI-Anfragen zusammen je Tag

    // Google Drive als Speicher (optional): OAuth-Client vom Typ „Webanwendung“ in der Google Cloud Console,
    // JavaScript-Ursprung = deine Adresse. Ohne diese Werte bleibt WebDAV (Nextcloud u. a.) als Speicher.
    'google_client_id'     => '',
    'google_client_secret' => '',

    // Weitere erlaubte Herkunft für die POST-Endpunkte. Die eigene Seite ist immer erlaubt.
    'allowed_origins' => [ /* 'https://example.org' */ ],

    // Ordner für Puffer und Zähler, AUSSERHALB des Web-Ordners. Standard: Temp-Ordner des Servers.
    'data_dir' => '',

    // Seitenaufrufe zählen mit GoatCounter (ohne Cookies). Standard: aus.
    'goatcounter' => '',   // z. B. 'https://DEINNAME.goatcounter.com/count'

    // Kennung beim Abruf fremder Feeds. Standard: OmegaLiberte-Feed mit Link auf das Rezept.
    'user_agent' => '',

    // Zero Ledger: Installations-Pings anderer Zentralen annehmen (api/ping.php, Summen unter ?summen). Standard: aus.
    // Wohin DEINE Nutzer (nur nach Einwilligung) pingen, steht in web/instanz.js unter „ping“ ('' = kein Ping-Angebot).
    'ping_annehmen' => false,
];
