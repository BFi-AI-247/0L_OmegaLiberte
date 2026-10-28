// SPDX-License-Identifier: AGPL-3.0-only
// KI – Anbieter: OpenRouter-Anmeldung, Modell auf dem Gerät (WebLLM), Zeitgrenze/Abbrechen und ein Aufruf für alle Anbieter (kiFrage). Besitzer: KI-Modus. Teil von KOMPASS (aus ki/ki.js geteilt, #88).
// Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.
'use strict';

/* ---------- OpenRouter: Anmeldung mit PKCE ---------- */
function kiB64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function kiOpenRouterStart() {
  const verifier = kiB64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = kiB64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = kiB64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem('kompass.or', JSON.stringify({ verifier, state }));
  const cb = location.origin + location.pathname;
  location.href = 'https://openrouter.ai/auth?callback_url=' + encodeURIComponent(cb) + '&code_challenge=' + challenge +
    '&code_challenge_method=S256&state=' + state + '&key_label=' + encodeURIComponent(tt('KOMPASS · ') + deviceName());
}
async function kiOpenRouterRueckkehr() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code'); if (!code) return;
  let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('kompass.or') || '{}'); } catch (e) { /* leer */ }
  sessionStorage.removeItem('kompass.or');
  history.replaceState(null, '', location.pathname);
  if (!saved.verifier || (q.get('state') && q.get('state') !== saved.state)) { flash(tt('OpenRouter-Anmeldung passt nicht – bitte neu verbinden.')); return; }
  try {
    const r = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: saved.verifier, code_challenge_method: 'S256' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.key) throw new Error((d.error && d.error.message) || tt('HTTP ') + r.status);
    await kiKeySpeichern('openrouter', d.key);
    const c = KI.cfg(); c.art = 'openrouter'; kiCfgSpeichern();
    S.screen = 'settings'; render();
    flash(tt('OpenRouter verbunden. Wähle unten ein Modell.'));
    kiOpenRouterModelle();
  } catch (e) { flash(tt('OpenRouter-Anmeldung fehlgeschlagen: ') + e.message); }
}
async function kiOpenRouterModelle() {
  if (KI.ui.orLaden) return; KI.ui.orLaden = true;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    const d = await r.json();
    const all = (d.data || []).filter((m) => m && m.id && !/image|audio|embed/i.test(m.id));
    const frei = all.filter((m) => m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0);
    const gern = /mistral|llama-3\.3-70b|gemma-3|deepseek|qwen/i;
    frei.sort((a, b) => (gern.test(b.id) - gern.test(a.id)) || ((b.context_length || 0) - (a.context_length || 0)));
    KI.ui.orModelle = frei.map((m) => ({ id: m.id, name: (m.name || m.id).replace(/\s*\(free\)\s*$/i, '') }));
    const c = KI.cfg();
    if (c.art === 'openrouter' && !c.modell && KI.ui.orModelle.length) { c.modell = KI.ui.orModelle[0].id; kiCfgSpeichern(); }
  } catch (e) { KI.ui.orModelle = []; }
  KI.ui.orLaden = false; render();
}

/* ---------- Modell auf dem Gerät (WebLLM) ---------- */
async function kiLokalLaden(id, nurStart) {
  if (KI.engine && KI.engineId === id) return KI.engine;
  if (KI.engineLaden) return KI.engineLaden;
  if (!navigator.gpu) throw new Error(tt('Dieser Browser kann keine Modelle auf dem Gerät ausführen (WebGPU fehlt). Am besten Chrome auf dem Laptop.'));
  KI.engineLaden = (async () => {
    const webllm = await import(KI_WEBLLM);
    const ids = (webllm.prebuiltAppConfig.model_list || []).map((m) => m.model_id);
    const mid = ids.includes(id) ? id : (ids.find((x) => /Qwen2\.5-1\.5B-Instruct-q4f16/.test(x)) || id);
    KI.ui.laden = { pct: 0, text: tt('Starte …') }; render();
    const eng = await webllm.CreateMLCEngine(mid, { initProgressCallback: (p) => {
      KI.ui.laden = { pct: Math.round((p.progress || 0) * 100), text: String(p.text || '').replace(/\[.*?\]\s*/, '').slice(0, 90) };
      if (S.screen === 'settings') render(); else kiLaufZeigen();
    } });
    KI.engine = eng; KI.engineId = id; KI.ui.laden = null;
    store.set('kiLokalGeladen', id);
    return eng;
  })();
  try { return await KI.engineLaden; } catch (e) { KI.ui.laden = null; throw e; } finally { KI.engineLaden = null; }
}

/* ---------- Ein Aufruf für alle Anbieter ---------- */
// msgs: [{role:'system'|'user'|'assistant', content}], opt: { json, max, zeit (Sekunden) }
// Zeitgrenze (Issue #3): Langsame Modelle enden mit einer verständlichen Meldung statt ohne Ende zu laufen.
// Bei „Auf diesem Gerät“ zählt die Zeit erst nach dem Laden des Modells.
function kiZeitgrenze(c) { return c.art === 'openai' ? 180 : 90; }
async function kiMitZeit(sek, arbeit, abbruch) {
  let t;
  const zeit = new Promise((_, nein) => { t = setTimeout(() => { try { abbruch(); } catch (e) { /* egal */ }
    nein(new Error(tt('Deine KI hat nach {s} s nicht geantwortet – das Modell ist für diese Aufgabe vermutlich zu langsam. Ein kleineres Modell oder eine KI im Netz hilft.').replace('{s}', sek))); }, sek * 1000); });
  try { return await Promise.race([arbeit, zeit]); } finally { clearTimeout(t); }
}
// Laufende Anfrage (Issue #28): sichtbarer Stand (Modell lädt %, dann „schreibt …“) und Abbrechen bei Dialog und Faktencheck.
// opt.lauf = Kennung des Aufrufers ('dialog', 'fakt'); KI.laeufe[kennung] = { phase: 'laden'|'schreibt', stoppen }.
KI.laeufe = {};
function kiLaufText(kennung) {
  const l = KI.laeufe[kennung]; const lokal = KI.cfg().art === 'lokal';
  if (l && l.phase === 'laden') return tt('Lade Modell auf das Gerät … {p} %').replace('{p}', (KI.ui.laden && KI.ui.laden.pct) || 0);
  return lokal ? tt('Das Modell schreibt …') : tt('Denke nach …');
}
function kiLaufZeigen() {
  document.querySelectorAll('[data-ki-lauf]').forEach((el) => { el.textContent = kiLaufText(el.getAttribute('data-ki-lauf')); });
}
function kiAbbrechen(kennung) { const l = KI.laeufe[kennung]; if (l) l.stoppen(); }
// Knopf „Abbrechen“ samt Stand – nur solange eine eigene KI für diese Kennung arbeitet
function kiLaufAnzeige(kennung, standText) {
  const l = KI.laeufe[kennung];
  return h('span', { class: 'ki-lauf' }, h('span', { 'data-ki-lauf': l ? kennung : null }, l ? kiLaufText(kennung) : standText),
    l ? h('button', { type: 'button', class: 'mini', onClick: () => kiAbbrechen(kennung) }, tt('Abbrechen')) : null);
}
async function kiFrage(msgs, opt = {}) {
  const c = KI.cfg(); const ac = new AbortController(); let abbruch = () => ac.abort();
  let stoppen; const stopp = new Promise((_, nein) => { stoppen = () => { try { abbruch(); } catch (e) { /* egal */ } nein(new Error(tt('Abgebrochen.'))); }; });
  stopp.catch(() => {});
  const lokalLaedt = c.art === 'lokal' && !(KI.engine && KI.engineId === (c.modell || KI_LOKAL_MODELLE[0].id));
  const lauf = { phase: lokalLaedt ? 'laden' : 'schreibt', stoppen: () => stoppen() };
  if (opt.lauf) { KI.laeufe[opt.lauf] = lauf; render(); }
  try {
    if (c.art === 'lokal') {
      const eng = await Promise.race([kiLokalLaden(c.modell || KI_LOKAL_MODELLE[0].id), stopp]);
      abbruch = () => { ac.abort(); try { eng.interruptGenerate(); } catch (e) { /* egal */ } };
      lauf.phase = 'schreibt'; kiLaufZeigen();
    }
    return await Promise.race([kiMitZeit(opt.zeit || kiZeitgrenze(c), kiFrageRoh(msgs, opt, ac.signal), () => abbruch()), stopp]);
  } finally { if (opt.lauf && KI.laeufe[opt.lauf] === lauf) delete KI.laeufe[opt.lauf]; }
}
async function kiFrageRoh(msgs, opt, signal) {
  const c = KI.cfg(); const max = opt.max || 700;
  const fehler = async (r) => { const t = await r.text().catch(() => ''); let m = ''; try { const j = JSON.parse(t); m = (j.error && (j.error.message || j.error)) || j.message || ''; } catch (e) { m = t.slice(0, 160); }
    if (r.status === 401 || r.status === 403) return new Error(tt('Zugang abgelehnt – Schlüssel prüfen oder neu verbinden.'));
    if (r.status === 429) return new Error(tt('Dein KI-Kontingent ist gerade ausgeschöpft. Bitte später noch einmal.'));
    if (r.status === 402) return new Error(tt('Bei deinem KI-Konto ist kein Guthaben mehr – wähle ein kostenloses Modell.'));
    return new Error(tt('Die KI hat nicht geantwortet (') + r.status + (m ? ': ' + String(m).slice(0, 120) : '') + ').'); };
  // #48: Claude (Anthropic) spricht ein eigenes Format (/v1/messages, x-api-key) – erkannt an der Adresse
  if (c.art === 'openai' && modulAn('ki-vorlagen') && kiIstAnthropic(c.url)) {
    const key = await kiKeyLaden('openai');
    const sys = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const liste = [];
    msgs.filter((m) => m.role !== 'system').forEach((m) => { const role = m.role === 'assistant' ? 'assistant' : 'user'; const l = liste[liste.length - 1]; if (l && l.role === role) l.content += '\n\n' + m.content; else liste.push({ role, content: String(m.content || '') }); });
    if (!liste.length || liste[0].role !== 'user') liste.unshift({ role: 'user', content: '…' });
    const body = { model: c.modell || KI_ANTHROPIC_STD, max_tokens: max, temperature: opt.json ? 0.2 : 0.3, messages: liste };
    if (sys) body.system = sys + (opt.json ? '\n\nAntworte ausschließlich mit gültigem JSON.' : '');
    else if (opt.json) body.system = 'Antworte ausschließlich mit gültigem JSON.';
    const r = await fetch(c.url.replace(/\/+$/, '') + '/messages', { method: 'POST', signal, body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'x-api-key': key || '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    if (!r.ok) throw await fehler(r);
    const d = await r.json();
    return ((d && d.content) || []).filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
  }
  if (c.art === 'openrouter' || c.art === 'openai') {
    const url = c.art === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : c.url.replace(/\/+$/, '') + '/chat/completions';
    const key = c.art === 'openrouter' ? KI.keys.openrouter : await kiKeyLaden('openai');
    const hd = { 'Content-Type': 'application/json' };
    if (key) hd.Authorization = 'Bearer ' + key;
    if (c.art === 'openrouter') { hd['HTTP-Referer'] = location.origin + location.pathname; hd['X-Title'] = INSTANZ.name; }
    const body = { model: c.modell || (c.art === 'openrouter' ? 'openrouter/auto' : ''), messages: msgs, max_tokens: max, temperature: opt.json ? 0.2 : 0.3 };
    if (opt.json) body.response_format = { type: 'json_object' };
    let r = await fetch(url, { method: 'POST', headers: hd, body: JSON.stringify(body), signal });
    if (!r.ok && opt.json && r.status === 400) {
      const t = await r.clone().text().catch(() => '');
      if (c.art === 'openai' && KI_ZU_LANG.test(t)) throw await fehler(r);  // Kontext zu klein: nicht ohne json wiederholen, kiKuratieren stückelt
      delete body.response_format; r = await fetch(url, { method: 'POST', headers: hd, body: JSON.stringify(body), signal });
    }
    if (!r.ok) throw await fehler(r);
    const d = await r.json();
    return String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
  }
  if (c.art === 'gemini') {
    const model = c.modell || KI_GEMINI_STD;
    const sys = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const body = {
      contents: msgs.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: Object.assign({ maxOutputTokens: Math.max(max, 1024), temperature: 0.3 }, opt.json ? { responseMimeType: 'application/json' } : {})
    };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KI.keys.gemini || '' }, body: JSON.stringify(body), signal });
    if (!r.ok) throw await fehler(r);
    const d = await r.json();
    return ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map((p) => p.text || '').join('').trim();
  }
  if (c.art === 'browser') {
    if (typeof self.LanguageModel === 'undefined') throw new Error(tt('Dieser Browser hat keine eingebaute KI.'));
    const sys = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = msgs.filter((m) => m.role !== 'system');
    const last = rest.pop();
    const session = await self.LanguageModel.create({ initialPrompts: [{ role: 'system', content: sys }].concat(rest),
      monitor(m) { m.addEventListener('downloadprogress', (e) => { KI.ui.laden = { pct: Math.round(e.loaded * 100), text: tt('Browser lädt seine KI …') }; render(); }); } });
    KI.ui.laden = null;
    try { return String(await session.prompt(last.content, { signal })).trim(); } finally { try { session.destroy(); } catch (e) { /* egal */ } }
  }
  if (c.art === 'lokal') {
    const eng = await kiLokalLaden(c.modell || KI_LOKAL_MODELLE[0].id);
    const body = { messages: msgs, max_tokens: max, temperature: 0.3 };
    if (opt.json) body.response_format = { type: 'json_object' };
    const d = await eng.chat.completions.create(body);
    return String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
  }
  throw new Error(tt('Keine KI gewählt.'));
}

