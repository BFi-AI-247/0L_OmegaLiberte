// SPDX-License-Identifier: AGPL-3.0-only
// Quellen – Starter-Paket: lesen (Kurzform v1, source-pack JSON, OPML), Vorschau, übernehmen, teilen. Besitzer: Quellen.
// Wege hinein: Link …/#paket=<Kurzform>, …/#paket-url=<https-JSON>, Einstellungen → „Paket einfügen“.
// Nie automatisch: immer erst Vorschau, der Mensch übernimmt. Formate: 0L formats/source-pack.md
//
// Kurzform v1 (eine Zeile, Einträge mit | getrennt):
//   0l1|lang:de|wish:mehr%20Raumfahrt|web:https://…|rss:https://…|yt:@handle|bsky:name.bsky.social|masto:@user@instanz
const PAKET_MAX = 300;
const PAKET_ARTEN = { rss: 'rss', web: 'web', yt: 'youtube', youtube: 'youtube', bsky: 'bluesky', bluesky: 'bluesky', masto: 'mastodon', mastodon: 'mastodon' };
const PAKET_LABEL = { rss: 'Feed', web: 'Website', youtube: 'YouTube', bluesky: 'Bluesky', mastodon: 'Mastodon' };

function paketSauber(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
function paketDecode(s) { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); } }

// Text → { titel, sprache, wunsch, quellen: [{ art, url?, handle?, titel }], hinweis }
function paketLesen(text) {
  let t = String(text || '').trim();
  const p = { titel: '', name: '', sprache: '', wunsch: '', quellen: [], hinweis: '' };
  if (!t) return p;
  if (t.length > 1000000) { p.hinweis = tt('Paket zu groß.'); return p; }
  // Ganze KI-Antwort eingefügt: Link oder JSON-Block darin finden
  if (!/^[{[<]/.test(t)) {
    const l = /https?:\/\/\S*#paket=\S+/.exec(t);
    const j = /\{[\s\S]*"format"\s*:\s*"0l\.source-pack[\s\S]*\}/.exec(t);
    if (l) t = l[0].replace(/[).,;:!?*`'"\]>]+$/, ''); else if (j) t = j[0];
  }
  if (/^[{[]/.test(t)) {
    let d; try { d = JSON.parse(t); } catch (e) { p.hinweis = tt('Kein gültiges JSON.'); return p; }
    if (!d || typeof d !== 'object' || !/^0l\.source-pack\//.test(String(d.format || ''))) { p.hinweis = tt('Kein Paket im Format 0l.source-pack.'); return p; }
    p.titel = paketSauber(d.title, 80); p.sprache = paketSauber(d.language, 5); p.wunsch = paketSauber(d.wish, 300);
    (Array.isArray(d.sources) ? d.sources : []).forEach((s) => { if (s && typeof s === 'object') p.quellen.push({ art: PAKET_ARTEN[s.kind] || String(s.kind || ''), url: s.url, handle: s.handle, titel: s.title }); });
    return p;
  }
  if (/<opml|<outline/i.test(t)) {
    opmlLesen(t).forEach((x) => p.quellen.push({ art: 'rss', url: x.url, titel: x.titel }));
    return p;
  }
  // Kurzform: ganzer Link erlaubt; Trenner |, %7C oder Zeilenumbruch
  const m = /#paket=(.*)$/s.exec(t); if (m) t = m[1]; else t = t.replace(/^paket=/, '');
  t.split(/\||%7C|\r?\n/i).map((x) => x.trim()).filter(Boolean).forEach((e) => {
    const k = /^([a-z0-9]+):(.*)$/i.exec(e); if (!k) { if (e !== '0l1') p.quellen.push({ art: '?', url: e }); return; }
    const key = k[1].toLowerCase(); let v = k[2];
    if (key === 'lang') p.sprache = paketSauber(paketDecode(v), 5);
    else if (key === 'wish') p.wunsch = paketSauber(paketDecode(v), 300);
    else if (key === 'title') p.titel = paketSauber(paketDecode(v), 80);
    else if (key === 'name') { /* früherer Zentralen-Name (bis v0.41): wird ignoriert, #8 */ }
    else {
      const art = PAKET_ARTEN[key] || key;
      if (/^https?%3A/i.test(v) || /^%40/.test(v)) v = paketDecode(v);
      if (art === 'rss' || art === 'web' || (art === 'youtube' && /^https?:/i.test(v))) p.quellen.push({ art, url: v });
      else p.quellen.push({ art, handle: paketDecode(v) });
    }
  });
  return p;
}

// Prüfen: nur http(s), Handles im erwarteten Muster, Obergrenze, Dubletten → Einträge mit status 'neu' | 'da' | 'doppelt' | 'ungueltig'
function paketPruefen(p) {
  const gesehen = new Set(); const aus = [];
  const feedDa = new Set(settings.feeds.map((f) => f.url));
  const ytDa = new Set(settings.feeds.filter((f) => f.handle).map((f) => f.handle.toLowerCase()));
  const kontoDa = (k) => S.kfollows.some((f) => f.key === k) || !!S.entries[k] || !!S.alias[k];
  for (const q of p.quellen) {
    const e = { art: q.art, titel: paketSauber(q.titel, 80), status: 'neu', grund: '' };
    if (q.art === 'rss' || q.art === 'web' || (q.art === 'youtube' && q.url)) {
      let u = null; try { u = new URL(String(q.url || '').trim()); } catch (er) { /* ungültig */ }
      if (!u || !/^https?:$/.test(u.protocol) || u.username || u.password || String(q.url).length > 800) { e.status = 'ungueltig'; e.grund = tt('nur http(s)-Adressen'); e.wert = paketSauber(q.url, 80); }
      else { e.url = u.href; e.wert = u.href; }
      if (q.art === 'youtube' && e.url && !/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(u.hostname)) { e.status = 'ungueltig'; e.grund = tt('keine YouTube-Adresse'); }
      e.schluessel = (q.art === 'web' ? 'w:' : q.art === 'youtube' ? 'y:' : 'r:') + (e.url || '');
      if (e.status === 'neu' && q.art === 'rss' && feedDa.has(e.url)) e.status = 'da';
    } else if (q.art === 'youtube') {
      const h = '@' + String(q.handle || '').trim().replace(/^@/, '');
      if (!/^@[\w.\-]{2,60}$/.test(h)) { e.status = 'ungueltig'; e.grund = tt('kein YouTube-@Handle'); }
      e.handle = h; e.wert = h; e.schluessel = 'y:' + h.toLowerCase();
      if (e.status === 'neu' && ytDa.has(h.toLowerCase())) e.status = 'da';
    } else if (q.art === 'bluesky') {
      const h = String(q.handle || '').trim().replace(/^@/, '').toLowerCase();
      if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h) && !/^did:plc:[a-z0-9]{10,40}$/.test(h)) { e.status = 'ungueltig'; e.grund = tt('kein Bluesky-Handle'); }
      e.handle = h; e.wert = '@' + h; e.schluessel = 'b:' + h;
      if (e.status === 'neu' && kontoDa(e.schluessel)) e.status = 'da';
    } else if (q.art === 'mastodon') {
      const m = /^@?([\w.]+)@([\w.-]+\.[a-z]{2,})$/i.exec(String(q.handle || '').trim());
      if (!m) { e.status = 'ungueltig'; e.grund = tt('kein Mastodon-Konto (@name@instanz)'); e.wert = paketSauber(q.handle, 80); }
      else { e.acct = m[1] + '@' + m[2].toLowerCase(); e.wert = '@' + e.acct; e.schluessel = 'm:' + e.acct; if (kontoDa(e.schluessel)) e.status = 'da'; }
    } else { e.status = 'ungueltig'; e.grund = tt('unbekannte Art'); e.wert = paketSauber(q.url || q.handle || q.art, 80); }
    if (e.status === 'neu' && gesehen.has(e.schluessel)) e.status = 'doppelt';
    if (e.schluessel) gesehen.add(e.schluessel);
    aus.push(e);
  }
  const neu = aus.filter((e) => e.status === 'neu');
  if (neu.length > PAKET_MAX) neu.slice(PAKET_MAX).forEach((e) => { e.status = 'ungueltig'; e.grund = tt('mehr als ') + PAKET_MAX + tt(' Quellen'); });
  return aus;
}

function paketVorschau(text, woher) {
  const p = paketLesen(text);
  const liste = paketPruefen(p);
  S.paket = { stufe: 'vorschau', p, liste, woher: woher || '', sprache: SPRACHEN.some((x) => x[0] === p.sprache) ? p.sprache : '' };
  if (!liste.length && !p.wunsch && !S.paket.sprache) S.paket.leer = p.hinweis || tt('In diesem Paket habe ich keine Quellen gefunden.');
  render();
}

// Beim Start und bei Hash-Wechsel: #paket=… oder #paket-url=…; danach Hash aus der Adresse entfernen
// Feste Einstiege (Issue #39, Journey W0): Link …/#einstieg=w0 richtet ein neues Gerät ohne Willkommen ein – für Menschen,
// die nichts konfigurieren sollen (Link öffnen, lesen). Inhalt kommt nur aus dieser Tabelle, nie aus dem Link.
// Schon eingerichtete Geräte werden nicht still verändert: sie sehen die übliche Paket-Vorschau.
const EINSTIEGE = {
  w0: { modul: 'einstieg-w0', sprache: 'de', radar: ['radar-gifhorn'], gruppe: 'Regional: Gifhorn' }
};
function einstiegAusAdresse() {
  const m = /^#(?:einstieg=)?(w0)$/i.exec(location.hash || ''); if (!m) return false;
  const id = m[1].toLowerCase(); const E = EINSTIEGE[id];
  if (!E || !modulAn(E.modul)) return false;
  history.replaceState(null, '', location.pathname + location.search);
  const gruppe = CATALOG.find((g) => g.gruppe === E.gruppe);
  if (settings.onboarded) {
    if (gruppe) paketVorschau('0l1|lang:' + E.sprache + '|' + gruppe.items.map(([, u]) => 'rss:' + u).join('|'), tt('aus dem Link'));
    return false;
  }
  E.radar.forEach((k) => { if (k in RADAR_FEEDS) settings.radar[k] = true; });
  if (gruppe) gruppe.items.forEach(([n, u, d, kind]) => {
    if (!settings.feeds.some((x) => x.url === u)) settings.feeds.push({ id: hashId(u), url: u, title: n, kind: kind === 'youtube' ? 'youtube' : 'rss', icon: '', site: 'https://' + d + '/' });
  });
  settings.einstieg = id; settings.onboarded = true;
  if (E.sprache) settings.sprache = E.sprache;
  save('settings');
  if (E.sprache) spracheSetzen(E.sprache);
  S.screen = null;
  return false;
}

async function paketAusAdresse() {
  const hs = location.hash;
  const m = /^#paket(-url)?=(.*)$/s.exec(hs); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (!m[1]) { paketVorschau(m[2], tt('aus dem Link')); return; }
  const url = paketDecode(m[2]).trim();
  if (!/^https:\/\/[^\s/]+\//i.test(url)) { paketVorschau('', ''); S.paket.leer = tt('Paket-Adresse muss mit https:// beginnen.'); render(); return; }
  S.paket = { stufe: 'laden', woher: url }; render();
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); clearTimeout(tm);
    if (!r.ok) throw new Error(tt('HTTP ') + r.status);
    const t = await r.text(); if (t.length > 1000000) throw new Error(tt('Paket zu groß.'));
    paketVorschau(t, hostOf(url));
  } catch (e) {
    S.paket = { stufe: 'vorschau', liste: [], p: {}, leer: tt('Paket nicht abrufbar (') + (e.name === 'AbortError' ? tt('Zeitüberschreitung') : e.message) + tt('). Tipp: Inhalt kopieren und unter Einstellungen → „Paket einfügen“ einsetzen.') };
    render();
  }
}

async function paketUebernehmen() {
  const P = S.paket; if (!P || P.stufe !== 'vorschau') return;
  const neu = P.liste.filter((e) => e.status === 'neu');
  P.stufe = 'laeuft'; P.fertig = 0; P.gesamt = neu.length; P.fehlt = []; render();
  const schritt = () => { P.fertig++; if (S.paket === P) render(); };
  const feedDazu = (feed) => { if (!settings.feeds.some((f) => f.url === feed.url)) settings.feeds.push(Object.assign({ id: hashId(feed.url) }, feed)); };
  const kontoDazu = (f) => { if (!S.kfollows.some((x) => x.key === f.key)) S.kfollows.push(f); };
  await pool(neu, 4, async (e) => {
    try {
      if (e.art === 'rss') feedDazu({ url: e.url, title: shortTitle(e.titel || hostOf(e.url)), kind: /youtube\.com\/feeds\//.test(e.url) ? 'youtube' : 'rss', icon: '', site: '' });
      else if (e.art === 'web' || e.art === 'youtube') {
        const ziel = e.url || 'https://www.youtube.com/' + e.handle;
        const d = await getJSON('api/rss.php?aktion=finden&url=' + encodeURIComponent(ziel));
        const g = d.status === 'ok' ? (d.gefunden || []).filter((x) => !/comment/i.test(x.url)) : [];
        const wahl = e.art === 'youtube' ? g.find((x) => x.art === 'youtube') : g[0];
        if (!wahl) throw new Error('nicht gefunden');
        const yt = wahl.art === 'youtube';
        feedDazu({ url: wahl.url, title: shortTitle(e.titel || d.name || wahl.titel || hostOf(ziel)), kind: yt ? 'youtube' : 'rss', icon: d.bild || '', site: d.seite || '', handle: e.handle || undefined });
      } else if (e.art === 'bluesky') {
        const a = await getJSON('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(e.handle));
        if (!a.handle) throw new Error('nicht gefunden');
        kontoDazu({ key: 'b:' + a.handle, name: a.displayName || e.titel || a.handle, avatar: a.avatar, service: 'bluesky', handle: '@' + a.handle, did: a.did });
      } else if (e.art === 'mastodon') {
        const [u, host] = e.acct.split('@');
        const a = await getJSON('https://' + host + '/api/v1/accounts/lookup?acct=' + encodeURIComponent(u));
        if (!a.id) throw new Error('nicht gefunden');
        kontoDazu({ key: 'm:' + e.acct, name: a.display_name || e.titel || a.username, avatar: a.avatar_static, service: 'mastodon', handle: '@' + e.acct });
      }
    } catch (er) { P.fehlt.push(e.titel || e.wert); }
    schritt();
  });
  if (P.p.wunsch) settings.aiWunsch = P.p.wunsch;
  const neueSprache = P.sprache && P.sprache !== LANG ? P.sprache : '';
  if (neueSprache) settings.sprache = neueSprache;
  const warNeu = !settings.onboarded;
  settings.onboarded = true;
  save('settings', 'kfollows');
  const n = P.gesamt - P.fehlt.length;
  if (neueSprache && spracheSetzen(neueSprache)) els.stage = null;
  S.paket = { stufe: 'fertig', n, fehlt: P.fehlt };
  if (warNeu || S.screen === 'onboarding') S.screen = null;
  render(); loadAll();
}

// Umgekehrt: eigene Quellen als Link (Kurzform) und als JSON
function paketEigenes() {
  const q = [];
  // Bluesky-Feeds/-Listen kennt das Paketformat 0l.source-pack/1 noch nicht (#16) – nicht mit exportieren
  settings.feeds.filter((f) => f.kind !== 'bluesky').forEach((f) => q.push(f.handle ? { kind: 'youtube', title: f.title, handle: f.handle } : { kind: 'rss', title: f.title, url: f.url }));
  S.kfollows.forEach((k) => {
    const m = /^m:(.+)$/.exec(k.key || ''); const b = /^b:(.+)$/.exec(k.key || '');
    if (m) q.push({ kind: 'mastodon', title: k.name, handle: '@' + m[1] });
    else if (b) q.push({ kind: 'bluesky', title: k.name, handle: b[1] });
  });
  const pack = { format: '0l.source-pack/1', title: tt('Quellen aus ') + INSTANZ.name, language: LANG, sources: q };
  if (settings.aiWunsch) pack.wish = settings.aiWunsch;
  const url = (u) => String(u).replace(/[|#\s]/g, encodeURIComponent);  // Trenner %7C statt | – manche Chat-Apps beenden Links am |
  const teile = ['0l1', 'lang:' + LANG].concat(settings.aiWunsch ? ['wish:' + encodeURIComponent(settings.aiWunsch)] : [],
    q.map((s) => s.kind === 'rss' ? 'rss:' + url(s.url) : s.kind === 'youtube' ? 'yt:' + s.handle : s.kind === 'bluesky' ? 'bsky:' + s.handle : 'masto:' + s.handle));
  return { n: q.length, link: location.origin + location.pathname + '#paket=' + teile.join('%7C'), json: JSON.stringify(pack, null, 2) };
}

function paketKopieren(text, was) {
  const ok = () => flash(was + tt(' kopiert.'));
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => flash(tt('Kopieren nicht erlaubt – bitte von Hand markieren.')));
  else flash(tt('Kopieren nicht erlaubt – bitte von Hand markieren.'));
}

function renderPaket() {
  const P = S.paket;
  const close = () => { S.paket = null; render(); };
  const kopf = (t) => h('div', { class: 'add-head' }, h('b', {}, t), closeBtn(tt('Schließen'), close));
  const blatt = (label, ...inhalt) => h('div', { class: 'overlay', onClick: (ev) => { if (ev.target === ev.currentTarget && P.stufe !== 'laeuft') close(); } },
    h('div', { class: 'bottom-sheet add-sheet paket-sheet', role: 'dialog', 'aria-label': label }, ...inhalt));
  if (P.stufe === 'laden') return blatt(tt('Starter-Paket'), kopf(tt('Starter-Paket')), h('p', { class: 'small add-msg' }, tt('Lade Paket von ') + P.woher + ' …'));
  if (P.stufe === 'eingeben') {
    const ta = h('textarea', { class: 'paket-text', id: 'k-paket', rows: '7', spellcheck: 'false', placeholder: tt('Link, Kurzform (0l1|web:…|yt:@…) oder JSON (0l.source-pack) einfügen'),
      onInput: (e) => { P.text = e.target.value; } });
    ta.value = P.text || '';
    return blatt(tt('Paket einfügen'), kopf(tt('Paket einfügen')),
      h('span', { class: 'small add-hint' }, tt('Starter-Paket von deiner KI oder von Freunden – als Link, Kurzform, JSON oder OPML. Du siehst erst eine Vorschau.')),
      h('label', { for: 'k-paket', class: 'sr' }, tt('Paket')), ta,
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', onClick: () => paketVorschau(P.text || '', tt('eingefügt')) }, tt('Vorschau')),
        h('button', { type: 'button', class: 'btn', onClick: close }, tt('Abbrechen'))));
  }
  if (P.stufe === 'teilen') {
    const e = paketEigenes();
    const feld = (id, wert, rows) => { const t = h('textarea', { class: 'paket-text', id, rows: String(rows), readonly: '', spellcheck: 'false', onFocus: (ev) => ev.target.select() }); t.value = wert; return t; };
    return blatt(tt('Mein Paket teilen'), kopf(tt('Mein Paket teilen')),
      h('span', { class: 'small add-hint' }, e.n + (e.n === 1 ? tt(' Quelle') : tt(' Quellen')) + tt(' – wer den Link öffnet, sieht erst eine Vorschau. Enthält nur Quellen, keine Likes, keinen Verlauf, keine Schlüssel.')),
      h('label', { for: 'k-paket-link', class: 'side-label small' }, tt('Link')), feld('k-paket-link', e.link, 3),
      e.link.length > 8000 ? h('span', { class: 'small add-msg' }, tt('Der Link ist sehr lang – manche Apps kürzen ihn. Dann besser den JSON-Text teilen.')) : null,
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'mini primary', onClick: () => paketKopieren(e.link, tt('Link')) }, tt('Link kopieren')),
        navigator.share ? h('button', { type: 'button', class: 'mini', onClick: () => navigator.share({ title: INSTANZ.name, url: e.link }).catch(() => {}) }, tt('Teilen …')) : null),
      h('label', { for: 'k-paket-json', class: 'side-label small' }, tt('JSON (für „Paket einfügen“)')), feld('k-paket-json', e.json, 6),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'mini', onClick: () => paketKopieren(e.json, tt('JSON')) }, tt('JSON kopieren'))));
  }
  if (P.stufe === 'fertig') {
    return blatt(tt('Starter-Paket'), kopf(tt('Starter-Paket übernommen')),
      h('p', { class: 'small add-msg' }, P.n + (P.n === 1 ? tt(' Quelle übernommen.') : tt(' Quellen übernommen.')) + (P.fehlt.length ? tt(' Nicht gefunden: ') + P.fehlt.slice(0, 12).join(', ') + (P.fehlt.length > 12 ? ' …' : '') : '')),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', onClick: close }, tt('Los geht’s'))));
  }
  if (P.stufe === 'laeuft') return blatt(tt('Starter-Paket'), kopf(tt('Starter-Paket')), h('p', { class: 'small add-msg' }, tt('Übernehme … ') + P.fertig + ' / ' + P.gesamt));
  // Vorschau
  const neu = P.liste.filter((e) => e.status === 'neu').length;
  const STATUS = { neu: '', da: tt('schon dabei'), doppelt: tt('doppelt'), ungueltig: tt('übersprungen') };
  const name = (e) => e.titel || (e.url ? hostOf(e.url) : e.wert) || '?';
  const zeilen = P.liste.map((e) => h('div', { class: 'add-row' + (e.status === 'neu' ? '' : ' paket-aus') },
    avatar({ key: e.schluessel || e.wert, name: name(e) }, 30),
    h('span', { class: 'row-text' }, h('span', { class: 'row-title', style: 'font-size:14px' }, name(e)),
      h('span', { class: 'row-sub' }, (PAKET_LABEL[e.art] || e.art) + (e.wert && e.wert !== name(e) ? ' · ' + e.wert : '') + (e.status !== 'neu' ? ' · ' + STATUS[e.status] + (e.grund ? ' (' + e.grund + ')' : '') : '') + (e.art === 'bluesky' || e.art === 'mastodon' ? tt(' · in KOMPASS folgen') : ''))),
    e.status === 'neu' ? h('span', { class: 'small' }, '✓') : null));
  const extra = [P.p.wunsch ? tt('Wunsch für die KI-Auswahl: „') + P.p.wunsch + '“' : '', P.sprache && P.sprache !== LANG ? tt('Sprache: ') + (SPRACHEN.find((x) => x[0] === P.sprache) || [])[1] : ''].filter(Boolean);
  return blatt(tt('Starter-Paket – Vorschau'), kopf(P.p.titel || tt('Starter-Paket')),
    h('span', { class: 'small add-hint' }, (P.woher ? P.woher + ' · ' : '') + neu + (neu === 1 ? tt(' neue Quelle') : tt(' neue Quellen')) + (P.liste.length > neu ? ' · ' + (P.liste.length - neu) + tt(' übersprungen') : '') + tt('. Nichts wird ohne dich übernommen.')),
    extra.length ? h('p', { class: 'small', style: 'margin:0 0 4px' }, extra.join(' · ')) : null,
    P.leer ? h('p', { class: 'small add-msg' }, P.leer) : h('div', { class: 'add-list' }, zeilen),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', disabled: !(neu || P.p.wunsch || (P.sprache && P.sprache !== LANG)), onClick: paketUebernehmen }, tt('Übernehmen')),
      h('button', { type: 'button', class: 'btn', onClick: close }, tt('Abbrechen'))));
}

window.addEventListener('hashchange', paketAusAdresse);
