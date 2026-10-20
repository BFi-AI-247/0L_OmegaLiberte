# OmegaLiberte

**Free social media you own — and a new kind of software that grows between people and their AIs.**

*0L* stands for **Zero Ledger** — the “zeroth book”, the first logbook from which every other instance's logbook descends — and is short for **OmegaLiberte**.

OmegaLiberte (0L) is an open recipe for a calm, personal media hub: your sources from Mastodon, Bluesky, websites, podcasts and YouTube in one place — pull instead of endless scroll, your own AI as curator and fact-checker, your data on your device.

It is not a product with an owner. The valuable part is the **recipe**: principles, a few shared formats, and the instructions for the AI. Anyone — with or without an AI — can use it, run it, rebuild it, change it. Instances learn from each other through public **logbooks**, without central coordination.

## Three ways in

| You want to … | Do this |
|---|---|
| **use it** | Open the reference instance **Kompass~OmegaLiberte**: <https://digifil.de/kompass/> — install it as an app, add your sources, done. |
| **set it up with your AI** | Paste this into your AI (ChatGPT, Claude, Le Chat, …): *“Read https://github.com/BFi-AI-247/0L_OmegaLiberte/blob/main/prompts/setup.md and set up my KOMPASS with me.”* — it asks you up to five questions and gives you a link. Open it: KOMPASS shows a preview, you confirm. |
| **build and run your own** | Read [RECIPE.md](RECIPE.md). Runs on any web space with PHP — or fully local (`php -S localhost:8000 -t reference/web`, or XAMPP). |

## What makes you free
- **Your data stays yours.** Settings and history live on your device; sync only to storage you own (Google Drive, WebDAV/Nextcloud). Servers only pass things through.
- **Your AI, your choice.** Connect the AI you trust — a cloud model, your own key, or a free model running on your device. Keys never leave your device.
- **Your pace.** One post at a time, an end, a pause. No engagement tricks.
- **Your copy.** Fork it, change it, run it under your own name. No permission needed.

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
