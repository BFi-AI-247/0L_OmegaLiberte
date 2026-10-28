// SPDX-License-Identifier: AGPL-3.0-only
// ===================================================================
// ki.js – „Verbinde deine eigene KI“
// ===================================================================
// KOMPASS bringt keinen eigenen Schlüssel in die App. Der Nutzer verbindet seine KI:
//   openrouter – Anmeldung bei OpenRouter (OAuth mit PKCE), viele Modelle, auch kostenlose
//   gemini     – eigener Schlüssel aus Google AI Studio
//   openai     – beliebiger OpenAI-kompatibler Dienst (OpenAI, Mistral, Ollama, LM Studio …)
//   browser    – im Browser eingebaute KI (Chrome), ohne Konto
//   lokal      – kostenloses Modell, einmal geladen, läuft ganz auf dem Gerät (WebGPU)
//   kompass    – Probe über das KOMPASS-Backend (Mistral, knappes Kontingent)
//
// Schutz der Zugangsschlüssel („Tresor“):
// - Nur auf diesem Gerät, nie im Abgleich (Drive/WebDAV), nie auf dem KOMPASS-Server.
// - Verschlüsselt (AES-GCM) in IndexedDB. Der Geräteschlüssel ist „nicht exportierbar“:
//   Der Browser rückt ihn nicht heraus, eine kopierte Datenbank ist ohne ihn wertlos.
// - Grenzen: Wer Code in KOMPASS ausführen kann (z. B. eine Lücke in der App), könnte den Schlüssel
//   benutzen. Darum: OpenRouter-Schlüssel mit Ausgabenlimit, jederzeit beim Anbieter widerrufbar.
// - Gesendet wird der Schlüssel nur an den gewählten Anbieter, direkt vom Gerät.
//
// Aufgeteilt (#88), Ladereihenfolge: ki.js (Arten, Zustand KI) → tresor.js → anbieter.js (OpenRouter, WebLLM, kiFrage)
// → fragen.js (Prompts, KI-Auswahl) → ki-box.js (Einstellungen „Deine KI“, kiInit, Quellen-Vorschläge).
// ===================================================================
'use strict';

const KI_ARTEN = ttFest(() => ({
  kompass: { label: tt('KOMPASS-Probe'), sub: tt('Mistral über unseren Server – knappes Kontingent zum Ausprobieren') },
  openrouter: { label: 'OpenRouter', sub: tt('Mit deinem OpenRouter-Konto anmelden – viele Modelle, auch kostenlose') },
  gemini: { label: tt('Google Gemini'), sub: tt('Dein Schlüssel aus Google AI Studio (mit Gratis-Kontingent)') },
  openai: { label: tt('Eigener Dienst'), sub: tt('OpenAI-kompatibel: OpenAI, Mistral, Ollama, LM Studio …') },
  browser: { label: tt('Im Browser eingebaut'), sub: tt('Die KI deines Browsers (Chrome) – ohne Konto, auf dem Gerät') },
  lokal: { label: tt('Auf diesem Gerät'), sub: tt('Kostenloses Modell einmal laden – danach ganz ohne Internet-KI') }
}));
const KI_LOKAL_MODELLE = ttFest(() => [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: tt('Qwen 2.5 · 1,5 B'), groesse: 'ca. 1 GB' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: tt('Qwen 2.5 · 3 B'), groesse: 'ca. 2 GB' }
]);
const KI_WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';
const KI_GEMINI_STD = 'gemini-2.5-flash';

const KI = {
  ui: { orModelle: null, orLaden: false, geminiKey: '', oaUrl: '', oaKey: '', oaModell: '', laden: null, fehler: '', test: '' },
  keys: {},          // entschlüsselte Schlüssel nur im Arbeitsspeicher
  engine: null, engineId: '', engineLaden: null,
  browserStatus: '',  // #96: Ergebnis von LanguageModel.availability() – 'unavailable' = Schnittstelle da, Modell läuft hier aber nicht
  // Die KI-Wahl gilt je Gerät (store, nicht im Abgleich): Laptop lokal, Handy z. B. OpenRouter.
  // Einmalige Übernahme aus dem früher abgeglichenen settings.ki.
  _c: null,
  cfg() {
    if (!this._c) {
      let c = store.get('kiGeraet', null);
      if (!c && settings.ki) { c = settings.ki; delete settings.ki; store.set('kiGeraet', c); save('settings'); }
      this._c = c;
    }
    if (!this._c || !KI_ARTEN[this._c.art]) { this._c = { art: 'kompass', modell: '', url: '' }; store.set('kiGeraet', this._c); }
    return this._c;
  },
  art() { return this.cfg().art; },
  // Ist die gewählte KI auf diesem Gerät nutzbar? Sonst fällt KOMPASS auf die Probe zurück.
  bereit() {
    const c = this.cfg();
    if (c.art === 'kompass') return kiProbeErlaubt();
    if (c.art === 'openrouter' || c.art === 'gemini') return !!this.keys[c.art];
    if (c.art === 'openai') return !!c.url;
    if (c.art === 'browser') return kiBrowserDa();
    if (c.art === 'lokal') return !!store.get('kiLokalGeladen', '');
    return false;
  },
  name() {
    const c = this.cfg();
    if (!this.bereit() || c.art === 'kompass') return kiEinladung() ? tt('Mistral (Einladung von {name})').replace('{name}', INSTANZ.betreiber[LANG] || INSTANZ.betreiber.de) : tt('Mistral (KOMPASS-Probe)');
    if (c.art === 'lokal') return (KI_LOKAL_MODELLE.find((m) => m.id === c.modell) || {}).label || tt('Modell auf dem Gerät');
    if (c.art === 'browser') return 'Browser-KI';
    return (c.modell || KI_ARTEN[c.art].label).replace(/:free$/, '') + (c.art === 'openrouter' ? tt(' (OpenRouter)') : '');
  },
  klein() { const c = this.cfg(); return this.bereit() && (c.art === 'lokal' || c.art === 'browser'); }
};
// #96: Browser-KI nutzbar = Schnittstelle vorhanden und das Gerät schafft das Modell (availability ≠ 'unavailable')
function kiBrowserDa() { return typeof self.LanguageModel !== 'undefined' && KI.browserStatus !== 'unavailable'; }
