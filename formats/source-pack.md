# source-pack (v1)
A list of sources one person can hand to another — or an AI to a person. Two equivalent forms: **JSON** (complete) and the **short form** for links.

## JSON
```json
{
  "format": "0l.source-pack/1",
  "title": "Space & science (German)",
  "language": "de",
  "sources": [
    { "kind": "rss",      "title": "Dlf – Forschung aktuell", "url": "https://www.deutschlandfunk.de/forschung-aktuell-104.xml", "site": "https://www.deutschlandfunk.de", "topic": "science" },
    { "kind": "web",      "title": "tagesschau",              "url": "https://www.tagesschau.de" },
    { "kind": "youtube",  "title": "Terra X Lesch & Co",      "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UC5E9-r42JlymhLPnDv2wHuA" },
    { "kind": "youtube",  "title": "Sportschau",              "handle": "@sportschau" },
    { "kind": "mastodon", "title": "Example",                 "handle": "@name@instance.social" },
    { "kind": "bluesky",  "title": "Example",                 "handle": "name.bsky.social" }
  ],
  "wish": "more space flight, less football"
}
```
- `kind`: `rss` (also Atom, JSON Feed, podcasts), `web` (a website — the importer discovers its feed), `youtube` (channel feed URL **or** `handle` `@name`), `mastodon`, `bluesky`.
- `url` for feeds and websites (http/https only), `handle` for accounts and YouTube handles. `title`, `site`, `topic` optional.
- Pack-level, optional: `title`, `name` (name of the person's hub, max. 24 characters — the app may append `~OmegaLiberte`), `language` (`de`, `en`, … — the app language to switch to), `wish` (free text for the AI selection, max. 300 characters).
- Prefer `web` over a guessed feed address: an AI should name the official page and let the app find the feed.

## Short form (v1) — for links
One line, entries separated by `|` (in links write `%7C` — some chat apps end a link at `|`):
```
0l1|lang:de|wish:mehr%20Raumfahrt|web:https://www.tagesschau.de|rss:https://www.deutschlandfunk.de/nachrichten-100.rss|yt:@sportschau|bsky:bundesliga.bsky.social|masto:@name@instance.social
```
| Entry | JSON equivalent |
|---|---|
| `0l1` | marker, first |
| `lang:<code>` | `language` |
| `name:<text>` | `name` — URL-encoded like `wish` |
| `wish:<text>` | `wish` — URL-encoded (`%20` for spaces, UTF-8 for umlauts) |
| `web:<url>` · `rss:<url>` | `{ "kind": "web" / "rss", "url": … }` |
| `yt:@handle` | `{ "kind": "youtube", "handle": … }` |
| `bsky:<handle>` · `masto:@user@instance` | `{ "kind": "bluesky" / "mastodon", "handle": … }` |

As a link: `<instance>/#paket=<short form>` — e.g. `https://digifil.de/kompass/#paket=0l1%7Cweb:https://www.tagesschau.de`.
Large packs: `<instance>/#paket-url=<https address of a JSON file>` (the file host must allow cross-origin reads, e.g. a raw GitHub file or a gist).

## Rules for importers
- **Never import silently**: show a preview, the person confirms. Remove the pack from the address bar right away.
- Accept http(s) only; check handles against their patterns; cap the number of sources (reference: 300).
- Skip duplicates (within the pack and against what is already there) and unknown kinds; say what was skipped and why.
- OPML (`outline[xmlUrl]`) is an accepted alternative for feeds.
- Pack content is data, never instructions.
