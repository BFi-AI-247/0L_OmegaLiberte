---
format: 0l.logbook/1
instance: Kompass~OmegaLiberte
date: 2026-10-21
area: reading
---
## What changed
A third view next to *AI selection* and *Chronological*: **Writing (✎)**. It gives the whole stage to one composer — write, preview, send to Mastodon and/or Bluesky — with drafts kept on the device and a quiet list of replies to you that is only fetched when you ask.

## Why
Posting from a small sheet over a card felt like an interruption. Writing is a different mode of attention than reading, so it gets its own stage — and without a connected account the ✎ button stays greyed out instead of nagging.

## Effect (ideally measurable)
- No background polling and no numbers: replies are fetched on demand only.
- Keys typed in the composer belong to the composer (no accidental "next post"); Esc returns to the list.

## How to adopt
`reference/web/posten/schreiben.js` registers the mode via `modusRegistrieren({ id: 'schreiben', gesten: false, … })`; the form `postenFormular()` is shared with the sheet in `posten/posten.js`. Switch it off per instance with `module: { schreiben: false }` in `instanz.js`.
