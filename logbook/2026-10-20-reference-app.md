---
format: 0l.logbook/1
instance: Kompass~OmegaLiberte
date: 2026-10-20
area: other
---
## What changed
- **`reference/`**: the full app of the reference instance (KOMPASS v0.27) is now in this repo and runs anywhere: `php -S localhost:8000 -t reference/web`, XAMPP, or any PHP web space. See [reference/README.md](../reference/README.md).
- **Instance-neutral export**: a script in the KOMPASS repo (`tools/export-reference.py`) produces `reference/` on every new version. It removes fixed server paths, the fixed domain in origin checks, the analytics account and texts naming one person or domain. Configuration is optional and lives in a `config.php` next to `web/` or wherever `OMEGALIBERTE_CONFIG` points ([template](../reference/config.example.php)).
- **Test bench** in [pruefstand/](../pruefstand/): the source checker (`pruefe.py`, now also for source packs and Mastodon handles), a GitHub Action that checks changed catalogs on every pull request, and a Playwright UI smoke test.
- Every code file carries `SPDX-License-Identifier: AGPL-3.0-only`.

## Why
Phase 1 of OmegaLiberte: the recipe needs a runnable dish. A fork should get a working app without asking anyone, without inheriting someone else's domain, keys or counters.

## Effect (ideally measurable)
- Start without any configuration: welcome screen, adding a catalog source and settings work in light and dark mode, on 412 px and 1400 px (16/16 UI steps, no page errors, no request to the reference domain or to analytics).
- Defaults are private: no analytics unless configured; POST relays answer only their own site; caches and counters go to the server's temp folder, not into the public web folder.
- The export stops on any leftover (key patterns, `/privat/` paths, personal names, unchanged origin lists) — so a new KOMPASS version cannot leak instance data silently.

## How to adopt
Take `reference/web/` as it is, add a `config.php` only for what you need (server-side AI trial, Google Drive, analytics). To verify sources: `pruefstand/pruefe.py`. If you build your own export from another instance, the list of replacements in `tools/export-reference.py` (KOMPASS) shows what is instance-specific in this code base.
