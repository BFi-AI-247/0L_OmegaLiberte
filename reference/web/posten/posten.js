// SPDX-License-Identifier: AGPL-3.0-only
// Posten – eigene Beiträge, Teilen und Antworten auf Mastodon und Bluesky. Besitzer: Posten.
// Mastodon: OAuth mit PKCE (App-Anmeldung je Server lokal gemerkt), Zugangs-Token im Tresor („posten:masto:<host>“).
// Bluesky: App-Passwort → createSession; refreshJwt im Tresor („posten:bsky“), accessJwt nur im Arbeitsspeicher.
// Leise: nichts automatisch senden, vor dem Senden immer eine Vorschau, keine Zahlen zu eigenen Posts.
// Zustand nur auf diesem Gerät (store 'posten', 'posten.apps' – nicht im Speicher-Abgleich).
const POSTEN_MAX = { mastodon: 500, bluesky: 300 };
const POSTEN_BSKY = 'https://bsky.social/xrpc/';
const POSTEN = { bskyAccess: '', bskyBis: 0, rueckkehr: null };

function postenKonten() { return store.get('posten', {}) || {}; }
function postenKontenSetzen(k) { store.set('posten', k); render(true); }  // Karten neu zeichnen: Knöpfe erscheinen/verschwinden
function postenVerbunden(dienst) { if (!modulAn('posten')) return false; const k = postenKonten(); return dienst ? !!k[dienst] : !!(k.mastodon || k.bluesky); }
function postenRedirect() { return location.origin + location.pathname + '?posten=masto'; }
function postenB64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
class PostenAbgelaufen extends Error {}

/* ---------- Mastodon: verbinden (OAuth + PKCE) ---------- */
async function postenMastoStart(eingabe) {
  const m = /^@?(?:[\w.]+@)?([\w.-]+\.[a-z]{2,})$/i.exec(String(eingabe || '').trim());
  if (!m) throw new Error(tt('Bitte deinen Mastodon-Server angeben, z. B. mastodon.social oder @name@server.'));
  const host = m[1].toLowerCase();
  const apps = store.get('posten.apps', {}) || {};
  let app = apps[host];
  if (!app || app.redirect !== postenRedirect()) {
    const r = await fetch('https://' + host + '/api/v1/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: INSTANZ.name, redirect_uris: postenRedirect(), scopes: 'read write', website: location.origin + location.pathname }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.client_id) throw new Error(tt('Der Server hat die Anmeldung von KOMPASS abgelehnt.'));
    app = { id: d.client_id, secret: d.client_secret, redirect: postenRedirect() };
    apps[host] = app; store.set('posten.apps', apps);
  }
  const verifier = postenB64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = postenB64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = postenB64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem('kompass.posten', JSON.stringify({ host, verifier, state }));
  location.href = 'https://' + host + '/oauth/authorize?response_type=code&client_id=' + encodeURIComponent(app.id) + '&redirect_uri=' + encodeURIComponent(app.redirect) +
    '&scope=' + encodeURIComponent('read write') + '&state=' + state + '&code_challenge=' + challenge + '&code_challenge_method=S256';
}
// Rückkehr: sofort beim Laden aus der Adresse nehmen (bevor andere Teile ?code= sehen), Tausch danach
(function postenRueckkehrMerken() {
  const q = new URLSearchParams(location.search);
  if (q.get('posten') !== 'masto') return;
  POSTEN.rueckkehr = { code: q.get('code') || '', state: q.get('state') || '', fehler: q.get('error') || '' };
  history.replaceState(null, '', location.pathname + location.hash);
})();
async function postenRueckkehr() {
  const r = POSTEN.rueckkehr; if (!r) return; POSTEN.rueckkehr = null;
  let s = {}; try { s = JSON.parse(sessionStorage.getItem('kompass.posten') || '{}'); } catch (e) { /* leer */ }
  sessionStorage.removeItem('kompass.posten');
  if (r.fehler || !r.code) { flash(tt('Mastodon-Verbindung abgebrochen.')); return; }
  if (!s.host || !s.verifier || r.state !== s.state) { flash(tt('Mastodon-Anmeldung passt nicht – bitte neu verbinden.')); return; }
  try {
    const app = (store.get('posten.apps', {}) || {})[s.host];
    const t = await fetch('https://' + s.host + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code: r.code, client_id: app.id, client_secret: app.secret, redirect_uri: app.redirect, code_verifier: s.verifier, scope: 'read write' }) });
    const d = await t.json().catch(() => ({}));
    if (!t.ok || !d.access_token) throw new Error(tt('Der Server hat den Zugang nicht ausgestellt.'));
    const me = await getJSON('https://' + s.host + '/api/v1/accounts/verify_credentials', { headers: { Authorization: 'Bearer ' + d.access_token, Accept: 'application/json' } });
    await kiKeySpeichern('posten:masto:' + s.host, d.access_token);
    const k = postenKonten(); k.mastodon = { host: s.host, acct: me.acct + '@' + s.host }; postenKontenSetzen(k);
    if (!settings.mastodon) { settings.mastodon = '@' + k.mastodon.acct; save('settings'); }  // Lesen gleich mit eingerichtet
    S.screen = 'settings'; S.einstReiter = 'konten'; S.form = null; render();
    flash(tt('Mastodon verbunden als @') + k.mastodon.acct);
  } catch (e) { flash(tt('Mastodon-Verbindung fehlgeschlagen: ') + e.message); }
}
async function postenMasto(pfad, opt) {
  const k = postenKonten().mastodon; if (!k) throw new PostenAbgelaufen('mastodon');
  const tok = await kiKeyLaden('posten:masto:' + k.host); if (!tok) throw new PostenAbgelaufen('mastodon');
  const r = await fetch('https://' + k.host + pfad, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + tok, Accept: 'application/json' }, (opt || {}).headers || {}) }));
  if (r.status === 401 || r.status === 403) throw new PostenAbgelaufen('mastodon');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || tt('HTTP ') + r.status);
  return d;
}

/* ---------- Bluesky: App-Passwort, Sitzung erneuern ---------- */
function postenJwtBis(jwt) { try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch (e) { return Date.now() + 60000; } }
async function postenBskyVerbinden(handle, passwort) {
  const id = String(handle || '').trim().replace(/^@/, '');
  if (!id || !passwort) throw new Error(tt('Bitte Bluesky-Name und App-Passwort eingeben.'));
  const r = await fetch(POSTEN_BSKY + 'com.atproto.server.createSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id, password: passwort }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.accessJwt) throw new Error(r.status === 401 ? tt('Name oder App-Passwort stimmt nicht.') : (d.message || tt('HTTP ') + r.status));
  await kiKeySpeichern('posten:bsky', d.refreshJwt);
  POSTEN.bskyAccess = d.accessJwt; POSTEN.bskyBis = postenJwtBis(d.accessJwt);
  const k = postenKonten(); k.bluesky = { handle: d.handle, did: d.did }; postenKontenSetzen(k);
  if (!settings.bluesky) { settings.bluesky = d.handle; save('settings'); }  // Lesen gleich mit eingerichtet
}
async function postenBskyZugang() {
  if (POSTEN.bskyAccess && Date.now() < POSTEN.bskyBis - 30000) return POSTEN.bskyAccess;
  const ref = await kiKeyLaden('posten:bsky'); if (!ref) throw new PostenAbgelaufen('bluesky');
  const r = await fetch(POSTEN_BSKY + 'com.atproto.server.refreshSession', { method: 'POST', headers: { Authorization: 'Bearer ' + ref } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.accessJwt) throw new PostenAbgelaufen('bluesky');
  await kiKeySpeichern('posten:bsky', d.refreshJwt);
  POSTEN.bskyAccess = d.accessJwt; POSTEN.bskyBis = postenJwtBis(d.accessJwt);
  return d.accessJwt;
}
async function postenBsky(methode, body) {
  const acc = await postenBskyZugang();
  const r = await fetch(POSTEN_BSKY + methode, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + acc }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 || d.error === 'ExpiredToken' || d.error === 'InvalidToken') { POSTEN.bskyAccess = ''; throw new PostenAbgelaufen('bluesky'); }
  if (!r.ok) throw new Error(d.message || tt('HTTP ') + r.status);
  return d;
}
async function postenTrennen(dienst) {
  const k = postenKonten();
  if (dienst === 'mastodon' && k.mastodon) await kiKeyLoeschen('posten:masto:' + k.mastodon.host);
  if (dienst === 'bluesky') { await kiKeyLoeschen('posten:bsky'); POSTEN.bskyAccess = ''; }
  delete k[dienst]; postenKontenSetzen(k);
  flash(dienst === 'mastodon' ? tt('Beim Trennen löscht KOMPASS den Zugang auf deinem Gerät. Widerrufe die Freigabe zusätzlich auf deinem Server unter Einstellungen → Konto → Autorisierte Anwendungen.') : tt('Bluesky getrennt.'));
}

/* ---------- Zählen, Links, Text ---------- */
const POSTEN_URL = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'»“]/g;
function postenZaehlen(text, dienst) {
  if (dienst === 'mastodon') return Array.from(String(text).replace(POSTEN_URL, 'x'.repeat(23))).length;  // Mastodon zählt Links als 23 Zeichen
  const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  return seg ? Array.from(seg.segment(String(text))).length : Array.from(String(text)).length;
}
// Bluesky-Facets für Links: Byte-Offsets in UTF-8
function postenFacets(text) {
  const enc = new TextEncoder(); const out = [];
  for (const m of String(text).matchAll(POSTEN_URL)) {
    const start = enc.encode(text.slice(0, m.index)).length;
    out.push({ index: { byteStart: start, byteEnd: start + enc.encode(m[0]).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  return out;
}

/* ---------- Senden ---------- */
async function postenSendenMasto(text, antwort) {
  const body = { status: text, visibility: 'public' };
  if (antwort && antwort.service === 'mastodon') {
    const s = await postenMasto('/api/v2/search?type=statuses&resolve=true&limit=1&q=' + encodeURIComponent(antwort.link || String(antwort.id).slice(2)));
    const st = (s.statuses || [])[0]; if (!st) throw new Error(tt('Den Beitrag findet dein Server nicht – Antwort nicht möglich.'));
    body.in_reply_to_id = st.id;
  }
  return postenMasto('/api/v1/statuses', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': hashId(text + (antwort ? antwort.id : '') + Date.now()) }, body: JSON.stringify(body) });
}
async function postenSendenBsky(text, antwort) {
  const k = postenKonten().bluesky;
  const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: [LANG] };
  const facets = postenFacets(text); if (facets.length) record.facets = facets;
  if (antwort && antwort.service === 'bluesky') {
    const uri = String(antwort.id).slice(2);
    const d = await getJSON('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=' + encodeURIComponent(uri));
    const post = (d.posts || [])[0]; if (!post) throw new Error(tt('Den Beitrag gibt es auf Bluesky nicht mehr.'));
    const parent = { uri: post.uri, cid: post.cid };
    const root = (post.record && post.record.reply && post.record.reply.root) || parent;
    record.reply = { root: { uri: root.uri, cid: root.cid }, parent };
  }
  return postenBsky('com.atproto.repo.createRecord', { repo: k.did, collection: 'app.bsky.feed.post', record });
}
// P = Zustand des Blatts (S.posten) oder der Bühne „Schreiben“ (S.postenBuehne, P.buehne = true)
function postenNeuZeichnen(P) { if (P.buehne) render(true); else render(); }
async function postenSenden(P) {
  P = P || S.posten; if (!P || P.stufe !== 'vorschau') return;
  P.stufe = 'senden'; P.ergebnis = Object.fromEntries(Object.entries(P.ergebnis || {}).filter(([, v]) => v === 'ok')); postenNeuZeichnen(P);  // Gesendetes nie doppelt
  for (const d of ['mastodon', 'bluesky']) {
    if (!P.ziele[d] || P.ergebnis[d] === 'ok') continue;
    try { await (d === 'mastodon' ? postenSendenMasto : postenSendenBsky)(P.text, P.antwort); P.ergebnis[d] = 'ok'; }
    catch (e) { P.ergebnis[d] = e instanceof PostenAbgelaufen ? 'abgelaufen' : (e.message || tt('Netz oder Server nicht erreichbar. Dein Entwurf bleibt erhalten und gespeichert.')); }
  }
  const alle = Object.keys(P.ziele).filter((d) => P.ziele[d]);
  if (alle.every((d) => P.ergebnis[d] === 'ok')) {
    if (P.buehne) { P.text = ''; P.stufe = 'schreiben'; P.ergebnis = {}; store.set('posten.entwurf', null); render(true); }
    else { S.posten = null; render(); }
    flash(tt('Dein Beitrag wurde gesendet.')); return;
  }
  P.stufe = 'vorschau'; postenNeuZeichnen(P);  // Entwurf bleibt, gesendete Ziele werden nicht noch einmal gesendet
}

/* ---------- Blatt „Neuer Beitrag“ ---------- */
function postenOeffnen(art, p) {
  const k = postenKonten();
  const ziele = { mastodon: !!k.mastodon, bluesky: !!k.bluesky };
  let text = '';
  if (art === 'antworten' && p) { ziele.mastodon = p.service === 'mastodon' && !!k.mastodon; ziele.bluesky = p.service === 'bluesky' && !!k.bluesky; if (p.service === 'mastodon' && p.handle) text = p.handle + ' '; }
  if (art === 'teilen' && p) text = '\n\n' + (p.link || '');
  S.posten = { stufe: 'schreiben', art: art || 'neu', antwort: art === 'antworten' ? p : null, bezug: p || null, text, ziele, ergebnis: {} };
  render();
  setTimeout(() => { const t = document.querySelector('.posten-sheet #k-posten-text'); if (t) { t.focus(); t.setSelectionRange(0, 0); } }, 30);
}
async function postenKiEntwurf(P) {
  P = P || S.posten; if (!P || !KI.bereit()) return;
  P.kiLaeuft = true; postenNeuZeichnen(P);
  const b = P.bezug;
  try {
    const t = await kiFrage([{ role: 'system', content: tt('Du schreibst einen kurzen, sachlichen Social-Media-Beitrag in der Sprache des Nutzers, ohne Hashtag-Flut, ohne Emojis-Ketten, höchstens 260 Zeichen. Gib nur den Text aus.') },
      { role: 'user', content: (P.art === 'antworten' ? tt('Antwort auf: ') : tt('Kommentar zu: ')) + (b ? ((b.title || '') + ' ' + String(b.text || '').slice(0, 600)) : tt('(eigener Beitrag)')) + (P.text.trim() ? tt('\nMeine Stichworte: ') + P.text.trim() : '') }], { max: 300 });
    P.text = String(t || '').trim() + (P.art === 'teilen' && b && b.link && !String(t).includes(b.link) ? '\n\n' + b.link : '');
  } catch (e) { flash(e.message); }
  P.kiLaeuft = false; postenNeuZeichnen(P);
}
// Inhalt des Formulars (ohne Rahmen): Schreiben bzw. Vorschau. opt.buehne: inline auf der Bühne, opt.autosave(text)
function postenFormular(P, opt = {}) {
  const k = postenKonten();
  const ziele = ['mastodon', 'bluesky'].filter((d) => k[d]);
  const zuLang = ziele.filter((d) => P.ziele[d] && postenZaehlen(P.text, d) > POSTEN_MAX[d]);
  const leer = !P.text.trim() || !ziele.some((d) => P.ziele[d]);
  const titel = P.art === 'antworten' ? tt('Antworten') : P.art === 'teilen' ? tt('Teilen') : tt('Neuer Beitrag');
  const bezug = P.bezug ? h('div', { class: 'posten-bezug small' }, (P.art === 'antworten' ? tt('Antwort an ') : tt('Teilst: ')) + (P.bezug.who || '') + ' – ' + String(P.bezug.title || P.bezug.text || '').replace(/\s+/g, ' ').slice(0, 120)) : null;
  const zahl = (d) => { const n = postenZaehlen(P.text, d); return h('span', { class: 'posten-zahl' + (n > POSTEN_MAX[d] ? ' zu-lang' : '') }, SERVICE_LABEL[d] + ' ' + n + '/' + POSTEN_MAX[d]); };
  const fehler = Object.entries(P.ergebnis || {}).filter(([, v]) => v !== 'ok').map(([d, v]) => h('p', { class: 'small add-msg posten-fehler' },
    SERVICE_LABEL[d] + ': ' + (v === 'abgelaufen' ? tt('Deine Anmeldung ist abgelaufen. Bitte verbinde das Konto neu.') + ' ' + tt('Dein Entwurf bleibt erhalten.') : v),
    v === 'abgelaufen' ? h('button', { type: 'button', class: 'mini', onClick: () => { S.posten = null; S.screen = 'settings'; S.einstReiter = 'konten'; S.form = null; render(); } }, tt('Neu verbinden')) : null));
  const gesendet = Object.entries(P.ergebnis || {}).filter(([, v]) => v === 'ok').map(([d]) => h('p', { class: 'small add-msg' }, SERVICE_LABEL[d] + ': ' + tt('gesendet.')));
  if (P.stufe === 'vorschau' || P.stufe === 'senden') {
    return [bezug, h('span', { class: 'small add-hint' }, tt('So sieht dein Beitrag aus. Nichts geht ohne dich raus.')),
      ziele.filter((d) => P.ziele[d]).map((d) => h('div', { class: 'posten-vorschau' }, h('span', { class: 'side-label small' }, SERVICE_LABEL[d] + (P.antwort ? tt(' · als Antwort') : '') + (P.ergebnis[d] === 'ok' ? tt(' · gesendet') : '')),
        h('div', { class: 'posten-vorschau-text' }, P.text))),
      gesendet, fehler,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn primary', disabled: P.stufe === 'senden', onClick: () => postenSenden(P) }, P.stufe === 'senden' ? tt('Sende …') : Object.keys(P.ergebnis || {}).length ? tt('Erneut senden') : tt('Senden')),
        h('button', { type: 'button', class: 'btn', disabled: P.stufe === 'senden', onClick: () => { P.stufe = 'schreiben'; postenNeuZeichnen(P); } }, tt('Zurück zum Text')))];
  }
  const langText = (l) => l.map((d) => SERVICE_LABEL[d] + ': ' + tt('Dein Text ist zu lang. Maximal {n} Zeichen.').replace('{n}', POSTEN_MAX[d])).join(' · ');
  const lang = h('p', { class: 'small add-msg posten-fehler', hidden: !zuLang.length }, langText(zuLang));
  const vorschauKnopf = h('button', { type: 'button', class: 'btn primary', disabled: leer || zuLang.length > 0, onClick: () => { P.stufe = 'vorschau'; P.ergebnis = Object.fromEntries(Object.entries(P.ergebnis || {}).filter(([, v]) => v === 'ok')); postenNeuZeichnen(P); } }, tt('Vorschau'));
  const zaehlerLeiste = h('div', { class: 'posten-zaehler small' }, ziele.filter((d) => P.ziele[d]).map(zahl));
  const tid = opt.buehne ? 'k-schreiben-text' : 'k-posten-text';
  const ta = h('textarea', { class: 'paket-text posten-text', id: tid, rows: opt.buehne ? '8' : '6', placeholder: tt('Was möchtest du sagen?'),
    onInput: (e) => {  // beim Tippen nur Zähler, Hinweis und Knopf neu – das Textfeld behält Fokus und Cursor
      P.text = e.target.value; if (opt.autosave) opt.autosave(P.text);
      const aktiv = ziele.filter((d) => P.ziele[d]); const l = aktiv.filter((d) => postenZaehlen(P.text, d) > POSTEN_MAX[d]);
      zaehlerLeiste.replaceChildren(...aktiv.map(zahl));
      lang.hidden = !l.length; lang.textContent = langText(l);
      vorschauKnopf.disabled = !P.text.trim() || !aktiv.length || l.length > 0;
      if (ablegen) ablegen.disabled = !P.text.trim();
    } });
  ta.value = P.text;
  const kreuz = ziele.map((d) => { const id = 'k-posten-' + d + (opt.buehne ? '-b' : ''); const c = h('input', { type: 'checkbox', id, disabled: !!P.antwort, onChange: (e) => { P.ziele[d] = e.target.checked; postenNeuZeichnen(P); } }); c.checked = !!P.ziele[d];
    return h('label', { class: 'ping-zeile', for: id }, c, h('span', {}, SERVICE_LABEL[d] + ' · ' + (d === 'mastodon' ? '@' + k.mastodon.acct : '@' + k.bluesky.handle))); });
  const ablegen = opt.buehne ? h('button', { type: 'button', class: 'btn', disabled: !P.text.trim(), onClick: schreibenAblegen }, tt('Als Entwurf ablegen')) : null;
  return [bezug, h('label', { for: tid, class: 'sr' }, titel), ta, zaehlerLeiste,
    h('div', { class: 'posten-ziele' }, kreuz), lang,
    KI.bereit() ? h('span', { class: 'small add-hint' }, tt('Entwurf von deiner KI – nur ein Vorschlag. Gesendet wird erst nach deiner Bestätigung.')) : null,
    h('div', { class: 'btn-row' },
      vorschauKnopf,
      KI.bereit() ? h('button', { type: 'button', class: 'btn', disabled: !!P.kiLaeuft, onClick: () => postenKiEntwurf(P) }, P.kiLaeuft ? tt('KI schreibt …') : tt('Entwurf von meiner KI')) : null,
      ablegen,
      opt.buehne ? null : h('button', { type: 'button', class: 'btn', onClick: opt.schliessen }, tt('Abbrechen')))];
}
function renderPosten() {
  const P = S.posten;
  const close = () => { if (P.stufe === 'senden') return; S.posten = null; render(); };
  const titel = P.art === 'antworten' ? tt('Antworten') : P.art === 'teilen' ? tt('Teilen') : tt('Neuer Beitrag');
  return h('div', { class: 'overlay', onClick: (ev) => { if (ev.target === ev.currentTarget) close(); } },
    h('div', { class: 'bottom-sheet add-sheet posten-sheet', role: 'dialog', 'aria-label': titel },
      h('div', { class: 'add-head' }, h('b', {}, titel), closeBtn(tt('Schließen'), close)), ...postenFormular(P, { schliessen: close })));
}

/* ---------- Haken: Karte (social/karten.js) und Einstellungen ---------- */
// An der Karte nur, wenn ein Dienst verbunden ist – sonst nichts (bisherige Ansichten unverändert)
function postenKnoepfe(p) {
  if (!p || String(p.id).startsWith('ai:') || !postenVerbunden()) return null;
  const k = postenKonten();
  const antwort = (p.service === 'mastodon' && k.mastodon) || (p.service === 'bluesky' && k.bluesky);
  return h('span', { class: 'posten-acts' },
    h('button', { type: 'button', class: 'mini', title: tt('Mit eigenem Kommentar teilen'), onClick: (e) => { e.stopPropagation(); postenOeffnen('teilen', p); } }, tt('↗ Teilen')),
    antwort ? h('button', { type: 'button', class: 'mini', onClick: (e) => { e.stopPropagation(); postenOeffnen('antworten', p); } }, tt('↩ Antworten')) : null);
}
// Reiter „Konten“: je Dienst Verbinden/Trennen fürs Posten (das Lesen der Folgeliste steht darüber in den Einstellungen)
function postenKonto(dienst) {
  if (!modulAn('posten')) return null;
  const k = postenKonten(); const F = S.postenForm || (S.postenForm = { masto: (parseMastodon(settings.mastodon) || {}).host || '', bsky: settings.bluesky || '', pw: '' });
  const lauf = async (fn) => { try { await fn(); } catch (e) { flash(e.message || String(e)); } render(); };
  const zeile = (wer, trennen) => h('div', { class: 'add-row' }, h('span', { class: 'row-text' }, h('span', { class: 'row-title', style: 'font-size:14px' }, tt('Posten')), h('span', { class: 'row-sub' }, tt('Verbunden als @') + wer)),
    h('button', { type: 'button', class: 'mini', onClick: trennen }, tt('Trennen')));
  if (dienst === 'mastodon') return k.mastodon ? zeile(k.mastodon.acct, () => postenTrennen('mastodon')) : h('div', { class: 'field' }, h('label', { for: 'k-posten-masto' }, tt('Zum Posten verbinden – dein Server')),
    h('div', { class: 'btn-row' }, h('input', { id: 'k-posten-masto', value: F.masto, placeholder: 'mastodon.social', autocomplete: 'off', spellcheck: 'false', onInput: (e) => { F.masto = e.target.value; } }),
      h('button', { type: 'button', class: 'mini primary', onClick: () => lauf(() => postenMastoStart(F.masto)) }, tt('Mit Mastodon verbinden'))),
    h('span', { class: 'small' }, tt('Mastodon verbindet dich ohne Passwort: KOMPASS öffnet die Anmeldung deines Servers, du bestätigst dort mit „Autorisieren“ und kehrst zurück.')));
  return k.bluesky ? zeile(k.bluesky.handle, () => postenTrennen('bluesky')) : h('div', { class: 'field' }, h('label', { for: 'k-posten-bsky' }, tt('Zum Posten verbinden')),
    h('input', { id: 'k-posten-bsky', value: F.bsky, placeholder: 'name.bsky.social', autocomplete: 'off', spellcheck: 'false', onInput: (e) => { F.bsky = e.target.value; } }),
    h('input', { id: 'k-posten-pw', type: 'password', value: F.pw, placeholder: tt('App-Passwort (xxxx-xxxx-xxxx-xxxx)'), autocomplete: 'off', onInput: (e) => { F.pw = e.target.value; } }),
    h('span', { class: 'small' }, tt('Bluesky braucht ein App-Passwort (nicht dein Hauptpasswort). Lege es in Bluesky unter Einstellungen → Datenschutz und Sicherheit → App-Passwörter an und füge es hier ein.'), ' ',
      h('a', { href: 'https://bsky.app/settings/app-passwords', target: '_blank', rel: 'noopener' }, tt('App-Passwort anlegen'))),
    h('button', { type: 'button', class: 'mini primary', style: 'align-self:flex-start', onClick: () => lauf(async () => { await postenBskyVerbinden(F.bsky, F.pw); F.pw = ''; flash(tt('Bluesky verbunden.')); }) }, tt('Mit Bluesky verbinden')));
}
window.addEventListener('load', () => { postenRueckkehr(); });
