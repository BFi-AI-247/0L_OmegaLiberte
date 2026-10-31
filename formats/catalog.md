# catalog (v1)
The starter sources an instance offers to new users: verified source lists in groups, one file per language. A catalog is public
reference data — it never contains anything about the people who use an instance.

## JSON
```json
{
  "format": "0l.catalog/1",
  "language": "de",
  "edition": "2026-10-31",
  "groups": [
    { "name": "Nachrichten", "order": 1, "sources": [
      { "kind": "rss", "title": "Tagesschau", "url": "https://www.tagesschau.de/index~rss2.xml", "site": "https://tagesschau.de",
        "language": "de", "checked": "2026-10-31" }
    ] },
    { "name": "YouTube: Top-YouTuber", "order": 13, "all_languages": true, "sources": [ … ] },
    { "name": "Bluesky", "order": 1000, "sources": [
      { "kind": "bluesky-list", "title": "Deutschsprachige Medien", "url": "https://bsky.app/starter-pack/tibor.net/3lbdiinjnya2z",
        "topic": "Nachrichten", "language": "de", "checked": "2026-10-31" }
    ] }
  ]
}
```
- File: `catalogs/<language>.json`. `language` is the language of the **sources** in that file, not of the group names.
- `edition`: date of this catalog version; the matching git tag is `katalog-<edition>`.
- `groups[]`: `name` (shown to people, in the language of the original catalog), `order` (groups with the same name in several
  language files belong together; show them ordered by `order`), optional `all_languages: true` (offer the whole group whatever the
  interface language — e.g. international channels).
- `sources[]`: the fields of a [source-pack](source-pack.md) entry (`kind`, `title`, `url`, `site`), plus `language` and `checked`
  (date of the last successful check with the test bench, see `pruefstand/`). Only checked entries are published.
- Additional kind `bluesky-list`: a Bluesky starter pack or list by its `bsky.app` address, plus an optional `topic`. Importers that
  do not know a kind skip it (source-pack rules).
- Add fields freely; never change the meaning of existing ones.

## Rules
- Only verified, general sources: what belongs to one instance alone (e.g. the operator's own blog) stays in that instance.
- Instances copy a tagged edition into their own files; apps do not fetch the catalog from here at runtime.
- Flow in one direction only: a catalog is edited at its source and published here; nothing an instance delivers is written back.
- A source that fails the test bench is removed from the next edition; old editions stay available through their tags.
