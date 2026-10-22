---
format: 0l.logbook/1
instance: Kompass~OmegaLiberte
date: 2026-10-21
area: design
---
## What changed
Settings are split into five tabs — **General, Sources, Accounts, AI, Storage** — instead of one long page. The welcome became three short steps: language/name/storage → topic packs → AI and start.

## Why
One long settings page mixed rarely used switches with the things people look for every day (sources, storage). Older readers got lost while scrolling; a tab names the place before you search it.

## Effect (ideally measurable)
- Every tab fits on a phone screen (412 px) without searching; the UI test bench opens all five tabs in light and dark.
- Other parts of the app can jump straight into a tab (e.g. "connect an account first" opens *Accounts*).

## How to adopt
`reference/web/kern/einstellungen.js`: the table `EINST_REITER` lists the tabs, `S.einstReiter` holds the open one; jump in from elsewhere with `S.screen = 'settings'; S.einstReiter = 'konten'`. Welcome: `renderEinrichtung()` with `f.schritt` 1–3. UI test: `pruefstand/oberflaeche.js`.
