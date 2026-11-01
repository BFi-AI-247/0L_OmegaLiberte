# Catalogs
Verified starter sources per language in the [catalog format](../formats/catalog.md). Every entry passed the test bench
(`pruefstand/`) on the date in its `checked` field; sources that fail are left out of the next edition.

**Current edition: 2026-11-01** (git tag `katalog-2026-11-01`)
- [de.json](de.json) – German sources: news, podcasts, sports, culture, lifestyle, tech, business, science, regional groups, PeerTube, Bluesky lists
- [en.json](en.json) – English sources in the same groups
- [es.json](es.json), [fr.json](fr.json), [ru.json](ru.json) – single sources in other languages

Most YouTube channels are missing from this edition: the test bench could not confirm their feeds on that day. They are added
again in a later edition once a check confirms them.

**How a catalog is maintained:** sources are edited at their origin and checked with the test bench; only checked, general
sources are published here as a new tagged edition. Instances copy a tagged edition into their own files – apps never fetch it
from here, and nothing is written back.

**Archive:** [archive/de-starter-2026-10-20.json](archive/de-starter-2026-10-20.json) – the first German starter pack (source-pack format, 20 Oct 2026).
