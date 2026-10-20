# Trial run of prompts/setup.md (21 Oct 2026)

**Setting:** Claude played the AI and followed `prompts/setup.md`; the person was **simulated** (German, climate and science, ESA on Bluesky, no sport, few sources). The answer was then opened as a link (phone) and pasted whole into *Paste pack* (laptop): each time one click and one confirmation set up a new KOMPASS. Example sources are in `pruefstand/lists/setup-example.txt` and checked by the test bench.

**Lesson:** three official homepages (DLR, Deutschlandfunk, klimareporter°) did not reveal a feed; the prompt now says to prefer `rss:` when the feed address is known for certain, and KOMPASS lists what it could not find.

---

**KI:** Hallo! KOMPASS bringt deine eigenen Quellen an einen ruhigen Ort – deine Daten bleiben auf deinem Gerät, kein Endlos-Scroll. Welche Themen interessieren dich?

**Mensch:** Klima und Wissenschaft, ein bisschen Nachrichten. Bitte auf Deutsch.

**KI:** Gut. Folgst du schon Konten auf Mastodon, Bluesky oder YouTube, die mit rein sollen?

**Mensch:** Auf Bluesky der ESA, sonst nichts.

**KI:** Was soll draußen bleiben – und lieber wenige oder viele Quellen?

**Mensch:** Kein Sport, kein Promi-Kram. Eher wenige.

**KI:** Hier ist dein Starter-Paket:

- tagesschau – verlässliche Nachrichten
- Deutschlandfunk – Hintergrund und Wissenschaft im Radio
- Spektrum der Wissenschaft – Forschung verständlich erklärt
- tagesschau (YouTube) – Nachrichten als Video
- ESA (Bluesky) – Raumfahrt aus erster Hand

[KOMPASS öffnen](https://digifil.de/kompass/#paket=0l1%7Clang:de%7Cwish:Klima%20und%20Wissenschaft,%20kein%20Sport,%20keine%20Promis%7Cweb:https://www.tagesschau.de%7Crss:https://www.deutschlandfunk.de/nachrichten-100.rss%7Cweb:https://www.spektrum.de%7Cyt:@tagesschau%7Cbsky:esa.int)

```
https://digifil.de/kompass/#paket=0l1%7Clang:de%7Cwish:Klima%20und%20Wissenschaft,%20kein%20Sport,%20keine%20Promis%7Cweb:https://www.tagesschau.de%7Crss:https://www.deutschlandfunk.de/nachrichten-100.rss%7Cweb:https://www.spektrum.de%7Cyt:@tagesschau%7Cbsky:esa.int
```

```json
{
  "format": "0l.source-pack/1",
  "title": "Klima & Wissenschaft",
  "language": "de",
  "wish": "Klima und Wissenschaft, kein Sport, keine Promis",
  "sources": [
    { "kind": "web", "title": "tagesschau", "url": "https://www.tagesschau.de" },
    { "kind": "rss", "title": "Deutschlandfunk", "url": "https://www.deutschlandfunk.de/nachrichten-100.rss" },
    { "kind": "web", "title": "Spektrum der Wissenschaft", "url": "https://www.spektrum.de" },
    { "kind": "youtube", "title": "tagesschau", "handle": "@tagesschau" },
    { "kind": "bluesky", "title": "European Space Agency", "handle": "esa.int" }
  ]
}
```

Öffne den Link – KOMPASS zeigt dir erst eine Vorschau, nichts wird ohne dich übernommen.
Deine Daten zuerst: alles bleibt in deinem Browser, Abgleich nur in deinen eigenen Speicher. Verbinde deine KI unter Einstellungen → KI, damit deine eigene KI bei Auswahl und Faktencheck hilft.
