---
format: 0l.logbook/1
instance: Kompass~OmegaLiberte
date: 2026-10-21
area: other
---
## What changed
- **Own name:** people name their hub (“Leas Ecke”), optionally with `~OmegaLiberte` appended (default on). Shown in header/sidebar, tab title, iPhone home-screen title, welcome and version line. Without an own name nothing changes. Starter packs carry it as `name` / `name:`.
- **Zero Ledger:** an opt-in installation ping ([formats/ledger-ping.md](../formats/ledger-ping.md)) — once on consent, then at most weekly; random number, kind, version, language, instance address. No sources, accounts, name or IP. Public sums at `api/ping.php?summen`.

## Why
A hub people name themselves is theirs, and `~OmegaLiberte` shows the family without a brand owner. Counting installations tells the project whether the recipe spreads — but only with consent, with nothing personal, and with sums anyone can read.

## Effect (ideally measurable)
- 26 checks (name everywhere, pack `name:`, no ping without consent, exactly one on consent, weekly rhythm with a staged clock, revocation, existing installs) plus server checks (any origin accepted, invalid/oversized refused, rate limit, sums, switched off). Main view, catalog and AI stage pixel-identical; welcome and settings gain the name field.
- Limit: the install name in the app launcher stays the instance name (manifest); a per-person manifest is not reliable across browsers.

## How to adopt
`web/kern/zentrale.js`, `web/api/ping.php`; `ping` in `web/instanz.js` chooses the ledger (or `''`), `ping_annehmen` in `config.php` lets your instance count others.
