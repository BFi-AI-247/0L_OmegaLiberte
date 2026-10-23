# ledger-ping (v1) — Zero Ledger
Two separate counts across all OmegaLiberte hubs:
- **User ping** — voluntary installation count from the app. **Opt-in only** (unticked box), revocable at any time.
- **Instance ping** — the operator registers the instance, server-side. **Opt-in by the operator** (`zero_ledger_instanz => true` in `config.php`). Never counted as an installation, and installations are never counted as instances.

## Request (user ping)
`POST <ledger>/api/ping.php`, body JSON (sent as `text/plain`, no preflight needed), at most 1 KB:
```json
{ "id": "3e0i5f6c612f6g421a2v5x13", "art": "neu", "version": "v0.29", "sprache": "de", "instanz": "omegaliberte.eu/kompass" }
```
| Field | Meaning |
|---|---|
| `id` | random installation number, created on the device (16–40 characters `a-z0-9`); deleted on the device when the person revokes |
| `art` | `neu` (new installation) · `bestehend` (there was history before consent) · `lebt` (sign of life) |
| `version`, `sprache` | app version, app language (`de`, `en`, …) |
| `instanz` | host and path of the instance — not the person's address |

**When:** once on consent, then at most weekly `lebt` when the app is opened. **Never sent:** sources, accounts, the hub's name, history, keys.

## Request (instance ping)
`POST <ledger>/api/ping.php`, sent by the instance's server (not by a browser):
```json
{ "art": "instanz", "version": "v0.50", "instanz": "example.org/kompass" }
```
Once when switched on, then at most every 30 days as a sign of life. **Only** host + path and app version — no user data, no counts from the instance. Target: `zero_ledger` in `config.php` (default: the reference ledger).

## Ledger rules
- Store only the latest state per `id`: first `art`, first/last date, `version`, `sprache`, `instanz`. **No IP**, no log of single pings. Delete entries without a sign of life for 12 months.
- Open to all instances (CORS `*` on this endpoint only), rate limit per IP hash and hour, size limit.
- Instances are stored separately (latest state per `instanz`: first/last date, `version`), same 12-month expiry.
- Public sums: `GET <ledger>/api/ping.php?summen` → `{ installationen, neu, bestehend, aktiv_30_tage, version: {…}, sprache: {…}, instanzen, instanzen_aktiv_30_tage, nutzer_je_instanz: {…}, stand }` — `nutzer_je_instanz` counts active user installations (30 days) per instance address; values below 5 are shown as `"<5"`.
- Reference ledger: <https://omegaliberte.eu/kompass/api/ping.php?summen>. Any instance may run its own (`ping_annehmen` in `config.php`).
