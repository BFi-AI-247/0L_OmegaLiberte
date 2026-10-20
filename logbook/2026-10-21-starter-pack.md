---
format: 0l.logbook/1
instance: Kompass~OmegaLiberte
date: 2026-10-21
area: sources
---
## What changed
- **Starter pack in the app**: a link `…/#paket=<short form>` (or `#paket-url=<https JSON>`) opens KOMPASS with a **preview** of the sources; nothing is added until the person confirms. Fallback: *Settings → Paste pack* takes the link, the short form, the JSON block, OPML — or simply the whole answer of the AI.
- **Share my pack**: turns your own sources into the same link and JSON (for family and friends). Sources only — no likes, no history, no keys.
- **Format**: [source-pack v1](../formats/source-pack.md) gained `kind: web` (website, feed found by the app), YouTube by `handle`, pack `language`, and the **short form** for links.
- **Set-up with your own AI**: [prompts/setup.md](../prompts/setup.md) — a conversation of at most five questions that ends in a pack.

## Why
> O-Ton (Björn, 21.10.2026): „Ein Mensch gibt seiner KI einen kurzen Start-Prompt mit Link auf unser Rezept … und gibt ihm am Ende ein Starter-Paket. Das öffnet KOMPASS fertig eingerichtet.“

Setting up sources was the hardest step for new people. Their own AI already knows their interests; it only needs a format the app can read — and the app must never trust it blindly.

## Effect (ideally measurable)
- From an AI answer to a set-up app: **one click + one confirmation**.
- 32 automated checks: an RSS-only link, a mixed JSON pack (website, YouTube handle, Bluesky, Mastodon, duplicates, unknown kind), a broken/malicious pack (`javascript:`, `file:`, credentials in URLs, HTML in titles, 400 entries, wrong JSON, `http` pack address), share → open round trip, and a simulated AI answer pasted whole. All existing views pixel-identical.

## How to adopt
`reference/web/quellen/paket.js` (reading, checks, preview, share), one box in `kern/einstellungen.js`, hooks in `kern/geruest.js` and `kern/start.js`. Your AI prompt: link to `prompts/setup.md` with your instance's address instead of `https://digifil.de/kompass/`.
