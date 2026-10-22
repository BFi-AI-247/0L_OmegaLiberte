# OmegaLiberte

**Free social media you own — and a new kind of software that grows between people and their AIs.**

*0L* stands for **Zero Ledger** — the “zeroth book”, the first logbook from which every other instance's logbook descends — and is short for **OmegaLiberte**.

OmegaLiberte (0L) is an open recipe for a calm, personal media hub: your sources from Mastodon, Bluesky, websites, podcasts and YouTube in one place — pull instead of endless scroll, your own AI as curator and fact-checker, your data on your device.

It is not a product with an owner. The valuable part is the **recipe**: principles, a few shared formats, and the instructions for the AI. Anyone — with or without an AI — can use it, run it, rebuild it, change it. Instances learn from each other through public **logbooks**, without central coordination.

## Choose your way

| | You want to … | Do this |
|---|---|---|
| **1 · Just use it** | read your sources in one calm place — with your AI or without | Open **Kompass~OmegaLiberte**: <https://digifil.de/kompass/> and install it as an app. With your AI: paste *“Read https://github.com/BFi-AI-247/0L_OmegaLiberte/blob/main/prompts/setup.md and help me start with OmegaLiberte.”* into ChatGPT, Claude, Le Chat … — a few questions, then one link that loads your sources. |
| **2 · Run your own instance** | your own hub on your web space or your own computer | Any web space with PHP: copy [reference/web](reference/) and follow [RECIPE.md](RECIPE.md) — or let your AI guide you with [prompts/host.md](prompts/host.md). On your computer: `php -S localhost:8000 -t reference/web`; on Windows the script [tools/windows-setup.ps1](tools/windows-setup.ps1) does everything (see [reference/README.md](reference/README.md)). |
| **3 · Build with us** | change it, improve it, take it somewhere new | Fork the repo, change what you like, and write a [logbook](logbook/) entry explaining *why* ([CONTRIBUTING.md](CONTRIBUTING.md)). Tell us on Mastodon with **#OmegaLiberte** — we read along and adopt what fits. |

## What makes you free
- **Your data stays yours.** Settings and history live on your device; sync only to storage you own (Google Drive, WebDAV/Nextcloud). Servers only pass things through.
- **Your AI, your choice.** Connect the AI you trust — a cloud model, your own key, or a free model running on your device. Keys never leave your device.
- **Your pace.** One post at a time, an end, a pause. No engagement tricks.
- **Your copy.** Fork it, change it, run it under your own name. No permission needed.

## Storage without a gatekeeper
Your settings, history, likes and bookmarks live in your browser first. If you want them on several devices, connect **storage you already own** — a folder in your Google Drive or any WebDAV/Nextcloud space. The files are plain, readable JSON in a folder called `KOMPASS`; you can open, back up or delete them yourself. There is no account with us and no copy on our server: Google is reached directly from your device, WebDAV only passes through the instance's relay without being stored. Switching storage or leaving means taking your files with you.

## How it evolves
See [CONTRIBUTING.md](CONTRIBUTING.md): copy → improve → write a logbook entry explaining *why* → others (and their AIs) adopt what fits them. Shared [formats](formats/) keep different versions compatible; the [test bench](pruefstand/) keeps adoption safe.

## Repository map
| Path | Content |
|---|---|
| [RECIPE.md](RECIPE.md) | The concept for humans and AIs: principles, building blocks, how to build your own |
| [formats/](formats/) | The few fixed agreements (source pack, curation, fact check, logbook entry) |
| [prompts/](prompts/) | AI instructions: curator, fact check, dialog, source suggestions |
| [catalogs/](catalogs/) | Verified sources per language and topic |
| [logbook/](logbook/) | What changed, where, and why — plus a list of known instances |
| [reference/](reference/) | The reference app – runnable, instance-neutral |
| [pruefstand/](pruefstand/) | Test bench for sources and formats |

## License
Code: **AGPL-3.0** — if you run an improved version for others, share the code. Texts, prompts, formats and catalogs: **CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/). Free stays free.

*Original German notes (O-Töne) are kept where they carry the founders' intent.*
