# ledger-ping (v1) — Zero Ledger
Voluntary installation count across all OmegaLiberte hubs. **Opt-in only** (unticked box), revocable at any time.

## Request
`POST <ledger>/api/ping.php`, body JSON (sent as `text/plain`, no preflight needed), at most 1 KB:
```json
{ "id": "3e0i5f6c612f6g421a2v5x13", "art": "neu", "version": "v0.29", "sprache": "de", "instanz": "digifil.de/kompass" }
```
| Field | Meaning |
|---|---|
| `id` | random installation number, created on the device (16–40 characters `a-z0-9`); deleted on the device when the person revokes |
| `art` | `neu` (new installation) · `bestehend` (there was history before consent) · `lebt` (sign of life) |
| `version`, `sprache` | app version, app language (`de`, `en`, …) |
| `instanz` | host and path of the instance — not the person's address |

**When:** once on consent, then at most weekly `lebt` when the app is opened. **Never sent:** sources, accounts, the hub's name, history, keys.

## Ledger rules
- Store only the latest state per `id`: first `art`, first/last date, `version`, `sprache`, `instanz`. **No IP**, no log of single pings. Delete entries without a sign of life for 12 months.
- Open to all instances (CORS `*` on this endpoint only), rate limit per IP hash and hour, size limit.
- Public sums: `GET <ledger>/api/ping.php?summen` → `{ installationen, neu, bestehend, aktiv_30_tage, version: {…}, sprache: {…}, stand }`.
- Reference ledger: <https://digifil.de/kompass/api/ping.php?summen>. Any instance may run its own (`ping_annehmen` in `config.php`).
