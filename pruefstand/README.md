# Test bench (Prüfstand)

Checks whether sources really exist and deliver posts — **before** they go into a catalog, a source pack or your instance.
It uses the same relay (`reference/web/api/rss.php`) as the app, so "✅ here" means "works in the app".

Why: AIs happily suggest sources that do not exist. In the first run of the reference instance, 23 of 44 AI-suggested sources were real. Verify every address automatically; never trust a list unchecked.

## Run it locally (2 minutes)
```sh
php -S 127.0.0.1:8099 -t reference/web &              # the reference relay
python3 pruefstand/pruefe.py pruefstand/lists/de-sources.txt
python3 pruefstand/pruefe.py catalogs/de-starter.json  # a source pack works too
```
Needs PHP 8.1+ with curl and Python 3.8+ (standard library only). Another server: `PRUEFSTAND_API=https://your.host/path/api/rss.php`.
Note: a real server's `rss.php` only answers same-origin browser calls and limits requests per hour; the local one is the easy way.

Add `--strict` to get exit code 1 when anything fails (useful in your own CI).

## Run it on GitHub
- **Manually:** Actions → *Quellen prüfen* → *Run workflow*, enter a list path (`.txt` or `.json`).
- **Automatically:** every pull request that touches `catalogs/` or `pruefstand/lists/` checks the changed files. The report is in the run summary and as artifact `pruefstand-ergebnis`. It does not block the pull request — a human reads it and decides.

Workflow file: [`.github/workflows/quellen-pruefen.yml`](../.github/workflows/quellen-pruefen.yml). It runs in forks without any secrets.

## Input formats
**Text list** — one source per line, `#` starts a comment:
```
https://www.deutschlandfunk.de/nachrichten-108.xml | Dlf Die Nachrichten
https://www.wissenschaft.de                         | website: the feed is discovered
https://www.youtube.com/@sportschau                | YouTube channel
bsky:bundesliga.bsky.social                        | Bluesky account
@name@instance.social                              | Mastodon account (placeholder)
```
**Source pack** — [formats/source-pack.md](../formats/source-pack.md) (`kind` rss, youtube, bluesky, mastodon).

## Output
A Markdown table: label, result (✅/❌ with title or reason), resolved feed address, number of items (audio/video), date of the newest item, and a summary line `N of M confirmed.`

Example lists in [lists/](lists/) come from the reference instance (German, Oct 2026). Run on 20 Oct 2026: `de-sources.txt` 23 of 44 confirmed, `de-sources-pages.txt` 8 of 13 — the failures are kept on purpose, they show what AI suggestions look like before checking.

## UI smoke test
[`oberflaeche.js`](oberflaeche.js) drives the reference app with Playwright: start, finish the welcome screen, add a source from the catalog, open settings — in light and dark, on a 412 px phone and a 1400 px laptop. It reports page errors and any request to analytics or to the reference domain.
```sh
php -S localhost:8000 -t reference/web &
npm i playwright@1.56.0 && npx playwright install chromium
node pruefstand/oberflaeche.js      # table on stdout, screenshots in pruefstand/shots/
```
