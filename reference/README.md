# OmegaLiberte — the reference app

A complete, working OmegaLiberte hub: one web app (no build step, plain JavaScript) plus a few small PHP relays.
Give it your own name and run it for yourself, your family or your community. It is exported **instance-neutral** from KOMPASS, the first public instance (<https://digifil.de/kompass/>): no fixed server paths, no fixed domain, no analytics account, no keys.

```
reference/
├── web/                 the app – this folder is what you put on a server
│   ├── index.html, app.css, sw.js, manifest.webmanifest
│   ├── kern/ social/ ki/ quellen/ lang/   app code (German names – see ARCHITECTURE below)
│   └── api/             PHP relays: rss.php (feeds), dav.php (WebDAV), gdrive.php, ai.php, kurator.php, …
├── config.example.php   template for your optional config.php
└── EXPORT.txt           which KOMPASS version this export came from
```

## 1. Run it locally in 5 minutes
You need **PHP 8.1 or newer** with the extensions `curl`, `openssl` and `mbstring` (check: `php -v` and `php -m`).

**Windows, all in one:** [tools/windows-setup.ps1](../tools/windows-setup.ps1) installs PHP (winget), enables the extensions, downloads this repo and starts your hub — read it first. Download and run in one go (PowerShell):
```powershell
cd $HOME\Downloads; Invoke-WebRequest https://raw.githubusercontent.com/BFi-AI-247/0L_OmegaLiberte/main/tools/windows-setup.ps1 -OutFile windows-setup.ps1 -UseBasicParsing; powershell -ExecutionPolicy Bypass -File windows-setup.ps1
```
Later, to start your hub again: run the same last part (`powershell -ExecutionPolicy Bypass -File windows-setup.ps1` in Downloads) – it updates and starts.

**Windows, step by step (PowerShell):** `winget install --id PHP.PHP.8.4 -e`, open a new PowerShell, then enable the extensions and the certificate list:
```powershell
$dir = Split-Path (Get-Command php).Source
Copy-Item "$dir\php.ini-development" "$dir\php.ini" -Force
Invoke-WebRequest https://curl.se/ca/cacert.pem -OutFile "$dir\cacert.pem"
(Get-Content "$dir\php.ini") -replace '^;extension_dir = "ext"', 'extension_dir = "ext"' -replace '^;extension=(curl|openssl|mbstring)', 'extension=$1' -replace '^;curl.cainfo =.*', "curl.cainfo = `"$dir\cacert.pem`"" | Set-Content "$dir\php.ini"
php -m | Select-String "curl|openssl|mbstring"
```
Download the repo as ZIP (`Invoke-WebRequest https://github.com/BFi-AI-247/0L_OmegaLiberte/archive/refs/heads/main.zip -OutFile ol.zip; Expand-Archive ol.zip .`), then run the command below inside `0L_OmegaLiberte-main`.

```sh
git clone https://github.com/BFi-AI-247/0L_OmegaLiberte.git
cd 0L_OmegaLiberte
php -S localhost:8000 -t reference/web
```
Open <http://localhost:8000/>. The welcome screen asks for your Mastodon / Bluesky handle (optional), then *Los geht’s*.
Add sources with **+ Quelle hinzufügen** → *Katalog* (or paste a website, YouTube channel, handle). The interface follows your browser language (German or English); change it at the top of the settings.

That's it. No database, no config, no account. Everything you set up lives in your browser (localStorage).

**XAMPP / MAMP / WAMP instead:** copy the *contents* of `reference/web/` to e.g. `htdocs/hub/` and open <http://localhost/hub/>.
Put an optional `config.php` into `htdocs/` **only if** your local server is not reachable from the network — better: set `OMEGALIBERTE_CONFIG` (see §4).

## 2. Put it on your own PHP web space
Any shared hosting with PHP 8.1+ (curl, mbstring) works (no cron, no database, no shell needed).

1. Upload the **contents** of `reference/web/` into a folder, e.g. `public_html/hub/` → `https://your.domain/hub/`.
2. Use **HTTPS** — the service worker (install as app) and secure key storage need it.
3. Optional: create `config.php` (§4) **outside** the public folder.
4. Open the address on your phone → browser menu → *Add to home screen*.

Rules the relays follow on any server: they only answer your own pages (origin check), they refuse internal network addresses, they limit requests per IP hash and hour, and they store nothing personal — only short-lived feed caches and counters in the data folder.

## 3. Connect your own AI
OmegaLiberte has **no operator key built in**. In the app: *Einstellungen → KI* and choose one:

| Option | What you need | Where your key lives |
|---|---|---|
| **OpenRouter** | free account; sign in with one click (PKCE), choose a model (free models available) | encrypted in this browser |
| **Google Gemini** | an API key from Google AI Studio | encrypted in this browser |
| **OpenAI-compatible service** | base URL + key + model — OpenAI, Mistral, or **local**: Ollama (`http://localhost:11434/v1`), LM Studio | encrypted in this browser |
| **Browser's built-in AI** | Chrome with its built-in model | on your device |
| **In-browser model** | a browser with WebGPU; one-time download | runs on your device, fully offline |
| **Server trial** (`ai.php`, `kurator.php`) | only if *you* as operator put a `mistral_key` into `config.php` — with hourly and daily limits | on your server |

For a local Ollama, allow the browser origin: `OLLAMA_ORIGINS=http://localhost:8000 ollama serve` (or your HTTPS address).
Prompts used by the app are documented in [../prompts/](../prompts/); AI answers follow [../formats/](../formats/).

## 4. config.php — what it can contain
Everything is optional. Without a `config.php`, sources, reading, WebDAV sync and your own AI work.

**Where the app looks** (first match wins):
1. environment variable `OMEGALIBERTE_CONFIG=/full/path/to/config.php` (e.g. `SetEnv` in `.htaccess`, or `OMEGALIBERTE_CONFIG=… php -S …`);
2. `config.php` **next to** the `web/` folder (`reference/config.php` when you run from this repo — git ignores it).

Copy [config.example.php](config.example.php) and fill in what you need:

| Key | Purpose | Default |
|---|---|---|
| `mistral_key` | server trial AI for dialog (`ai.php`) and AI selection (`kurator.php`) | none → people bring their own AI |
| `kompass_fragen_pro_stunde`, `kompass_kuratieren_pro_stunde`, `kompass_max_pro_tag` | limits for the server trial | 20 / 10 / 300 |
| `allowed_origins` | extra origins allowed to call the POST relays | only your own site |
| `data_dir` | folder for feed cache and counters, **outside** the public folder (also: env `OMEGALIBERTE_DATA`) | the server's temp folder |
| `goatcounter` | page view counting without cookies, e.g. `https://NAME.goatcounter.com/count` | off — nothing is loaded |
| `user_agent` | how the feed relay identifies itself to other sites | `OmegaLiberte-Feed/1 (+link to this repo)` |
| `ping_annehmen` | let `api/ping.php` count installation pings of other hubs (Zero Ledger, sums at `api/ping.php?summen`) | off |

**Own name and Zero Ledger.** People name their hub in *Settings* (default: the instance name; `~OmegaLiberte` appended unless switched off). The install name on the home screen stays the instance name from `manifest.webmanifest` — a per-person manifest is not reliable across browsers; iPhones take the page title, which follows the own name. The optional, opt-in installation ping goes to `ping` in `web/instanz.js` (default: the Zero Ledger on digifil.de; `''` hides the offer). Format: [formats/ledger-ping.md](../formats/ledger-ping.md).

**Never commit a real `config.php`.** Keys belong only on your server.

## 5. Posting (optional)
*Settings → Posting*: connect Mastodon (you confirm on your server, no password) and/or Bluesky (app password). Write, share and reply with a preview before every send. Needs **https or localhost** (the encrypted vault uses WebCrypto) — a plain `http://192.168…` address in a LAN will not do.

## 6. Check sources before you add them
The [test bench](../pruefstand/) uses this app's `api/rss.php` to verify lists and source packs — run it locally or as a GitHub Action in your fork.

## How this folder is made
`reference/` is generated from the KOMPASS instance by its export script (`tools/export-reference.py`, see [EXPORT.txt](EXPORT.txt) for the version). The script copies `web/`, replaces the instance-specific parts (`web/instanz.js`, the *Instanz* block in `web/api/_instanz.php`, title and manifest), adds the `SPDX-License-Identifier: AGPL-3.0-only` header to every code file, and refuses to finish if it finds key patterns or leftovers. Please do not hand-edit `reference/web/` in this repo — improvements go to KOMPASS (or into your fork, with a [logbook](../logbook/) entry).

What is instance-specific lives in two files: `web/instanz.js` (name, short brand, operator, RADAR services) and the *Instanz* block of `web/api/_instanz.php` (config location, data folder, allowed origins, feed user agent, counter). The export replaces only those, plus title and manifest — change them there for your own instance.

## Architecture in one paragraph
Classic scripts share one global namespace; load order in `index.html` is binding. `kern/` is the core (state, data model, navigation, storage, layout, settings), `social/` the chronological reading mode, `ki/` the AI mode (bring-your-own-AI vault, curator, dialog, fact check), `quellen/` loading and adding sources, `lang/` translations. A mode registers through `modusRegistrieren({...})` in `kern/modi.js`. File and function names are German — the code comments explain each part.

## License
Code in `reference/` and `pruefstand/`: **AGPL-3.0-only** (see [../LICENSE](../LICENSE)). If you run a modified version for others, share your code.
