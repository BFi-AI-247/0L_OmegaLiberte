// KI – Einstellungen „Deine KI“ (Wahl, Vorlagen, Test), Start (kiInit), Quellen-Vorschläge. Besitzer: KI-Modus. Teil von KOMPASS (aus ki/ki.js geteilt, #88).
// Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.
'use strict';

/* ---------- Einstellungen: „Deine KI“ ---------- */
function kiWaehlen(art) {
  const c = KI.cfg(); if (c.art === art) return;
  c.art = art; c.modell = art === 'lokal' ? KI_LOKAL_MODELLE[0].id : art === 'gemini' ? KI_GEMINI_STD : ''; c.url = art === 'openai' ? c.url : c.url;
  KI.ui.fehler = ''; KI.ui.test = ''; kiCfgSpeichern(); render();
  if (art === 'openrouter' && KI.keys.openrouter && !KI.ui.orModelle) kiOpenRouterModelle();
}
async function kiTesten() {
  KI.ui.test = tt('Frage deine KI …'); KI.ui.fehler = ''; render();
  try {
    const t = await kiFrage([{ role: 'system', content: 'Antworte auf Deutsch in einem kurzen Satz.' }, { role: 'user', content: tt('Sag Hallo und nenne dein Modell.') }], { max: 60 });
    KI.ui.test = '✓ ' + (t || tt('Antwort erhalten.')).slice(0, 160);
  } catch (e) { KI.ui.test = ''; KI.ui.fehler = modulAn('ki-vorlagen') ? kiFehlerKlar(e) : e.message; }
  render();
}
// #48 (Modul ki-vorlagen): Vorlagen je Anbieter für „Eigener Dienst“ – füllen Adresse und empfohlenes Modell vor
const KI_VORLAGEN = [
  { id: 'mistral', label: 'Mistral', url: 'https://api.mistral.ai/v1', modell: 'mistral-small-latest', schluessel: 'https://console.mistral.ai/api-keys', satz: () => tt('Schlüssel unter console.mistral.ai → API Keys anlegen (EU-Anbieter).') },
  { id: 'claude', label: 'Claude (Anthropic)', url: 'https://api.anthropic.com/v1', modell: 'claude-haiku-4-5', schluessel: 'https://console.anthropic.com/settings/keys', satz: () => tt('Schlüssel unter console.anthropic.com → API Keys anlegen.') },
  { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', modell: 'gpt-4o-mini', schluessel: 'https://platform.openai.com/api-keys', satz: () => tt('Schlüssel unter platform.openai.com → API keys anlegen.') },
  { id: 'ollama', label: tt('Ollama (lokal)'), url: 'http://localhost:11434/v1', modell: 'llama3.2', satz: () => tt('Läuft auf deinem Rechner, kein Schlüssel nötig. OLLAMA_ORIGINS={origin} setzen.').replace('{origin}', location.origin) },
  { id: 'lmstudio', label: tt('LM Studio (lokal)'), url: 'http://localhost:1234/v1', modell: '', satz: () => tt('Läuft auf deinem Rechner, kein Schlüssel nötig. Im Server-Reiter von LM Studio CORS einschalten; Modell = Name des geladenen Modells.') },
  { id: 'anderer', label: tt('Anderer'), url: '', modell: '', satz: () => tt('Adresse deines Dienstes mit /v1 am Ende, dazu Modell und Schlüssel laut Anbieter.') }
];
const KI_ANTHROPIC_STD = 'claude-haiku-4-5';
function kiIstAnthropic(u) { return /^https:\/\/api\.anthropic\.com\b/i.test(String(u || '')); }
function kiVorlageAktiv(c) { const u = c.url || ''; return (KI_VORLAGEN.find((v) => v.url && u.replace(/\/+$/, '') === v.url) || (u ? KI_VORLAGEN.find((v) => v.id === 'anderer') : null)); }
function kiVorlageWaehlen(v) {
  const c = KI.cfg(); const u = KI.ui;
  c.url = v.url; c.modell = v.modell; u.oaUrl = v.url; u.oaModell = v.modell; u.vorlage = v.id; KI.ui.fehler = ''; KI.ui.test = '';
  kiCfgSpeichern(); render();
}
// Klare Meldung nach „Speichern und testen“: verbunden / Schlüssel falsch / nicht erreichbar (Netz oder CORS) / Adresse falsch
function kiFehlerKlar(e) {
  const m = String((e && e.message) || e || '');
  if (e && e.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed/i.test(m))
    return tt('Nicht erreichbar: Adresse prüfen. Bei lokalen Diensten (Ollama, LM Studio) muss der Dienst laufen und Anfragen aus dem Browser erlauben (CORS).');
  if (/\(404/.test(m)) return tt('Adresse oder Modell stimmt nicht (404). Die Adresse endet meist auf /v1.');
  return m;
}
function renderKiBox() {
  const c = KI.cfg(); const u = KI.ui;
  const hatBrowserKi = kiBrowserDa();
  const arten = ['openrouter', 'gemini', 'lokal', 'openai'].concat(hatBrowserKi ? ['browser'] : []).concat(kiProbeErlaubt() ? ['kompass'] : []);
  const row = (a) => h('button', { type: 'button', class: 'toggle-row ki-row', 'aria-pressed': c.art === a ? 'true' : 'false', onClick: () => kiWaehlen(a) },
    h('span', { class: 'row-text' }, h('span', { class: 'row-title', style: 'font-size:15px' }, KI_ARTEN[a].label,
      a === c.art && KI.bereit() && a !== 'kompass' ? h('span', { class: 'ki-ok' }, tt(' · verbunden')) : null),
      h('span', { class: 'row-sub', style: 'white-space:normal' }, KI_ARTEN[a].sub)),
    h('span', { class: 'radio' }));
  let detail = null;
  if (c.art === 'openrouter' && KI.keys.openrouter && !u.orModelle && !u.orLaden) setTimeout(kiOpenRouterModelle, 0);
  if (c.art === 'openrouter') {
    detail = KI.keys.openrouter ? h('div', { class: 'ki-detail' },
      h('label', { for: 'k-ki-modell', class: 'small' }, tt('Modell (kostenlose zuerst)')),
      u.orModelle && u.orModelle.length ? h('select', { id: 'k-ki-modell', onChange: (e) => { c.modell = e.target.value; kiCfgSpeichern(); } },
        u.orModelle.map((m) => h('option', { value: m.id, selected: m.id === c.modell ? 'selected' : null }, m.name + tt(' · kostenlos'))),
        c.modell && !u.orModelle.some((m) => m.id === c.modell) ? h('option', { value: c.modell, selected: 'selected' }, c.modell) : null)
        : h('span', { class: 'small' }, u.orLaden ? tt('Lade Modelle …') : (c.modell || 'openrouter/auto')),
      h('div', { class: 'ki-btns' },
        h('button', { type: 'button', class: 'mini primary', onClick: kiTesten }, tt('Testen')),
        h('button', { type: 'button', class: 'mini', onClick: async () => { await kiKeyLoeschen('openrouter'); c.art = 'kompass'; kiCfgSpeichern(); render(); flash(tt('OpenRouter getrennt. Den Schlüssel kannst du bei OpenRouter unter „Keys“ löschen.')); } }, tt('Trennen'))),
      h('span', { class: 'small' }, tt('Tipp: Bei OpenRouter für den Schlüssel „KOMPASS“ ein Ausgabenlimit setzen – kostenlose Modelle kosten nichts.')))
      : h('div', { class: 'ki-detail' }, h('button', { type: 'button', class: 'btn primary', onClick: kiOpenRouterStart }, tt('Mit OpenRouter anmelden')),
        h('span', { class: 'small' }, tt('Du wirst zu OpenRouter geleitet und kommst mit einem eigenen Schlüssel zurück. Konto ist kostenlos.')));
  } else if (c.art === 'gemini') {
    detail = KI.keys.gemini ? h('div', { class: 'ki-detail' },
      h('label', { for: 'k-ki-gmodell', class: 'small' }, tt('Modell')),
      h('input', { id: 'k-ki-gmodell', value: c.modell || KI_GEMINI_STD, autocomplete: 'off', spellcheck: 'false', onChange: (e) => { c.modell = e.target.value.trim() || KI_GEMINI_STD; kiCfgSpeichern(); } }),
      h('div', { class: 'ki-btns' }, h('button', { type: 'button', class: 'mini primary', onClick: kiTesten }, tt('Testen')),
        h('button', { type: 'button', class: 'mini', onClick: async () => { await kiKeyLoeschen('gemini'); render(); } }, tt('Schlüssel entfernen'))))
      : h('div', { class: 'ki-detail' },
        h('span', { class: 'small' }, h('a', Object.assign({ href: 'https://aistudio.google.com/apikey' }, EXT), tt('Schlüssel in Google AI Studio erstellen')), tt(' – mit deinem Google-Konto, kostenlos im Rahmen des Gratis-Kontingents.')),
        h('input', { id: 'k-ki-gkey', type: 'password', value: u.geminiKey, placeholder: 'AIza…', autocomplete: 'off', onInput: (e) => { u.geminiKey = e.target.value.trim(); } }),
        h('button', { type: 'button', class: 'mini primary', style: 'align-self:flex-start', onClick: async () => { if (!u.geminiKey) return; await kiKeySpeichern('gemini', u.geminiKey); u.geminiKey = ''; render(); kiTesten(); } }, tt('Sicher speichern')));
  } else if (c.art === 'openai') {
    const vl = modulAn('ki-vorlagen');
    const aktiv = vl ? (KI_VORLAGEN.find((v) => v.id === u.vorlage) || kiVorlageAktiv(c)) : null;
    const kontextFeld = [h('label', { for: 'k-ki-kontext', class: 'small' }, tt('Kontext (Token) – leer lassen, außer dein Dienst meldet „zu lang“; dann z. B. 8192')),
      h('input', { id: 'k-ki-kontext', type: 'number', min: '1024', step: '1024', inputmode: 'numeric', value: c.kontext || '', placeholder: tt('unbegrenzt'), onChange: (e) => { const v = Math.round(+e.target.value || 0); c.kontext = v >= 1024 ? v : 0; kiCfgSpeichern(); } })];
    detail = h('div', { class: 'ki-detail' },
      vl ? h('div', { class: 'ki-vorlagen', role: 'group', 'aria-label': tt('Anbieter') }, KI_VORLAGEN.map((v) => h('button', { type: 'button', class: 'filter-pill', 'aria-pressed': aktiv && aktiv.id === v.id ? 'true' : 'false', onClick: () => kiVorlageWaehlen(v) }, v.label))) : null,
      vl && aktiv ? h('span', { class: 'small ki-vorlage-satz' }, aktiv.satz(), aktiv.schluessel ? [' ', h('a', Object.assign({ href: aktiv.schluessel }, EXT), tt('Zum Schlüssel'))] : null) : null,
      vl ? h('label', { for: 'k-ki-url', class: 'small' }, tt('Adresse')) : null,
      h('input', { id: 'k-ki-url', value: c.url || u.oaUrl, placeholder: vl ? 'https://…/v1' : 'https://api.mistral.ai/v1  ·  http://localhost:11434/v1', autocomplete: 'off', spellcheck: 'false', onInput: (e) => { u.oaUrl = e.target.value.trim(); } }),
      vl ? h('label', { for: 'k-ki-omodell', class: 'small' }, tt('Modell')) : null,
      h('input', { id: 'k-ki-omodell', value: c.modell || u.oaModell, placeholder: tt('Modell, z. B. mistral-small-latest'), autocomplete: 'off', spellcheck: 'false', onInput: (e) => { u.oaModell = e.target.value.trim(); } }),
      vl ? null : kontextFeld,
      h('input', { id: 'k-ki-okey', type: 'password', value: u.oaKey, placeholder: KI.keys.openai ? tt('•••• gespeichert') : tt('Schlüssel (bei lokalen Diensten leer lassen)'), autocomplete: 'off', onInput: (e) => { u.oaKey = e.target.value.trim(); } }),
      h('div', { class: 'ki-btns' }, h('button', { type: 'button', class: 'mini primary', onClick: async () => {
        c.url = u.oaUrl || c.url; c.modell = u.oaModell || c.modell; kiCfgSpeichern();
        if (u.oaKey) { await kiKeySpeichern('openai', u.oaKey); u.oaKey = ''; }
        render(); kiTesten(); } }, tt('Speichern und testen'))),
      vl ? h('span', { class: 'small' }, tt('Der Schlüssel bleibt verschlüsselt auf diesem Gerät. Im privaten Fenster gilt er nur, bis du das Fenster schließt.'))
        : h('span', { class: 'small' }, tt('Der Dienst muss Anfragen aus dem Browser erlauben (CORS). Ollama: OLLAMA_ORIGINS={origin} setzen.').replace('{origin}', location.origin)),
      vl ? h('details', { class: 'ki-erweitert' }, h('summary', { class: 'small' }, tt('Erweitert')), ...kontextFeld) : null);
  } else if (c.art === 'lokal') {
    const geladen = store.get('kiLokalGeladen', '');
    detail = h('div', { class: 'ki-detail' },
      h('div', { class: 'choices', style: 'grid-template-columns:repeat(2,minmax(0,1fr))' },
        KI_LOKAL_MODELLE.map((m) => h('button', { type: 'button', class: 'filter-pill', style: 'align-self:auto', 'aria-pressed': c.modell === m.id ? 'true' : 'false',
          onClick: () => { c.modell = m.id; kiCfgSpeichern(); render(); } }, m.label + ' · ' + m.groesse))),
      u.laden ? h('div', { class: 'ki-progress' }, h('div', { class: 'ki-bar', style: 'width:' + u.laden.pct + '%' }), h('span', { class: 'small' }, u.laden.pct + ' % · ' + u.laden.text)) : null,
      h('div', { class: 'ki-btns' },
        h('button', { type: 'button', class: 'mini primary', disabled: !!u.laden, onClick: async () => {
          KI.ui.fehler = ''; try { await kiLokalLaden(c.modell || KI_LOKAL_MODELLE[0].id); flash(tt('Modell bereit – läuft auf deinem Gerät.')); kiTesten(); } catch (e) { KI.ui.fehler = e.message; render(); } } },
          geladen === c.modell ? tt('Starten und testen') : tt('Modell laden')),
        geladen ? h('button', { type: 'button', class: 'mini', onClick: async () => { store.set('kiLokalGeladen', ''); KI.engine = null; try { const ks = await caches.keys(); await Promise.all(ks.filter((k) => /webllm/i.test(k)).map((k) => caches.delete(k))); } catch (e) { /* egal */ } flash(tt('Modell vom Gerät entfernt.')); render(); } }, tt('Vom Gerät löschen')) : null),
      h('span', { class: 'small' }, navigator.gpu ? tt('Einmalige Last über WLAN empfohlen. Danach antwortet die KI ohne Internet-Dienst – langsamer und einfacher als große Modelle, aber privat.') : tt('Dieser Browser kann keine Modelle auf dem Gerät ausführen (WebGPU fehlt). Am besten Chrome auf dem Laptop.')));
  } else if (c.art === 'browser') {
    detail = h('div', { class: 'ki-detail' }, h('div', { class: 'ki-btns' }, h('button', { type: 'button', class: 'mini primary', onClick: kiTesten }, tt('Testen'))),
      h('span', { class: 'small' }, tt('Beim ersten Mal lädt der Browser seine KI selbst nach. Antworten auf Deutsch sind je nach Version eingeschränkt.')));
  } else {
    detail = h('div', { class: 'ki-detail' }, h('span', { class: 'small' }, tt('Die Probe teilt sich ein kleines Kontingent mit allen. Für den Alltag: verbinde deine eigene KI.')));
  }
  return h('div', { class: 'card-box' }, h('h3', {}, tt('Deine KI')),
    h('p', { class: 'small', style: 'margin:0;line-height:1.5' }, tt('Dialog, Faktencheck und KI-Auswahl laufen über die KI, die du verbindest. Zugangsschlüssel bleiben verschlüsselt nur auf diesem Gerät – nicht im Abgleich, nicht auf unserem Server.')),
    arten.map((a) => [row(a), a === c.art ? detail : null]),
    u.test ? h('div', { class: 'note' }, u.test) : null,
    u.fehler ? h('div', { class: 'note err' }, u.fehler) : null,
    h('span', { class: 'small' }, tt('Aktiv: ') + KI.name() + (KI.bereit() ? '' : tt(' – deine Wahl ist auf diesem Gerät noch nicht verbunden'))));
}

async function kiInit() {
  KI.cfg();
  await Promise.all(['openrouter', 'gemini', 'openai'].map(kiKeyLaden));
  await kiOpenRouterRueckkehr();
  // #96: prüfen, ob die Browser-KI auf diesem Gerät wirklich läuft (Chrome 148+ meldet sonst nur, dass es die Schnittstelle gibt)
  if (typeof self.LanguageModel !== 'undefined' && typeof self.LanguageModel.availability === 'function') {
    try { KI.browserStatus = String(await self.LanguageModel.availability()); } catch (e) { KI.browserStatus = ''; }
  }
  if (KI.cfg().art === 'openrouter' && KI.keys.openrouter && S.screen === 'settings') kiOpenRouterModelle();
  render();
}

/* ---------- Quellen-Vorschläge: KI nennt Kandidaten, KOMPASS prüft jeden selbst ---------- */
const KI_QUELLEN_SYSTEM = `Du hilfst in KOMPASS, gute Quellen zu einem Thema zu finden. Nenne bis zu 8 reale, bekannte, seriöse Quellen,
die es tatsächlich gibt: YouTube-Kanäle (mit @-Handle), Websites mit RSS-Feed (Domain) oder Bluesky-Konten (Handle).
Regeln:
- Nur, was du sicher kennst – lieber weniger als erfunden. Jede Angabe wird automatisch geprüft, Erfundenes fällt weg.
- Bevorzuge deutschsprachige Quellen, ergänze wenige internationale.
- Mische die Arten, wenn es passt (z. B. 3 YouTube, 3 Websites, 2 Bluesky).
- „warum“ in höchstens 10 Wörtern auf Deutsch.
Antworte ausschließlich mit JSON in genau dieser Form:
{"quellen":[{"name":"…","art":"youtube","kennung":"@handle","warum":"…"},{"name":"…","art":"web","kennung":"beispiel.de","warum":"…"},{"name":"…","art":"bluesky","kennung":"name.bsky.social","warum":"…"}]}`;

async function kiQuellenVorschlaege(thema) {
  thema = String(thema || '').trim().slice(0, 300);
  let roh;
  if (KI.art() !== 'kompass' && KI.bereit()) {
    roh = kiJson(await kiFrage([{ role: 'system', content: KI_QUELLEN_SYSTEM }, { role: 'user', content: 'Thema/Wunsch des Nutzers: ' + thema }], { json: true, max: 900 }));
  } else {
    if (!kiProbeErlaubt()) throw new Error(KI_OHNE());
    const r = await fetch('api/kurator.php', { method: 'POST', headers: kiServerKopf(), body: JSON.stringify({ aufgabe: 'quellen', wunsch: thema }) });
    const d = await r.json().catch(() => ({}));
    if (d.status !== 'ok') throw new Error((d.antwort || tt('Die KI hat gerade keine Vorschläge geliefert.')) + (d.status === 'limit' ? tt(' Verbinde deine eigene KI in den Einstellungen.') : ''));
    roh = d;
  }
  const liste = (roh && Array.isArray(roh.quellen) ? roh.quellen : []).slice(0, 10);
  if (!liste.length) throw new Error(tt('Die KI hat keine Quellen genannt.'));
  const pruefe = async (q) => {
    const art = String(q.art || '').toLowerCase(); let ken = String(q.kennung || '').trim();
    const warum = String(q.warum || '').slice(0, 90);
    if (art === 'bluesky') {
      ken = ken.replace(/^@/, '').replace(/^https?:\/\/bsky\.app\/profile\//, '');
      const a = await getJSON('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(ken));
      if (!a || !a.handle) return null;
      return { kind: 'person', key: 'b:' + a.handle, name: a.displayName || a.handle, avatar: a.avatar, service: 'bluesky', handle: '@' + a.handle, did: a.did,
        sub: tt('✓ Bluesky @') + a.handle + (warum ? ' · ' + warum : '') };
    }
    let url;
    if (art === 'youtube') url = /youtu/.test(ken) ? ken : 'https://www.youtube.com/@' + ken.replace(/^@/, '').replace(/\s+/g, '');
    else url = /^https?:/i.test(ken) ? ken : 'https://' + ken.replace(/^\/+/, '');
    const d = await getJSON('api/rss.php?aktion=finden&url=' + encodeURIComponent(url));
    const g = d && d.status === 'ok' && (d.gefunden || []).find((x) => art === 'youtube' ? x.art === 'youtube' : x.art !== 'youtube');
    if (!g) return null;
    const yt = g.art === 'youtube';
    const title = shortTitle(yt ? (d.name || g.titel) : (d.name || g.titel || hostOf(g.url)));
    return { kind: 'feed', url: g.url, name: title, avatar: d.bild || '', service: yt ? 'youtube' : 'rss',
      sub: '✓ ' + (yt ? 'YouTube-Kanal' : tt('Feed · ') + hostOf(d.seite || g.url)) + (warum ? ' · ' + warum : ''),
      feed: { url: g.url, title, kind: yt ? 'youtube' : 'rss', icon: d.bild || '', site: d.seite || '' } };
  };
  const erg = await Promise.allSettled(liste.map(pruefe));
  const ok = []; const seen = new Set();
  erg.forEach((x) => { const r = x.status === 'fulfilled' && x.value; if (r && !seen.has(r.key || r.url)) { seen.add(r.key || r.url); ok.push(r); } });
  return { res: ok, verworfen: liste.length - ok.length };
}

function kiCfgSpeichern() { store.set('kiGeraet', KI.cfg()); }
