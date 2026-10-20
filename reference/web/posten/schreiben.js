// SPDX-License-Identifier: AGPL-3.0-only
// Posten – Modus „Schreiben“: eigene Bühne mit Schreibfeld, Entwürfen und „Antworten an dich“. Besitzer: Posten.
// Leise: Antworten werden nur beim Öffnen des Modus (oder auf Knopfdruck) abgefragt, keine Zähler, keine Abzeichen.
// Entwürfe liegen nur auf diesem Gerät (store 'posten.entwuerfe', 'posten.entwurf' – nicht im Abgleich).
const SCHREIBEN = { antworten: null, laden: false, fehler: '', geladenUm: 0 };
const ENTWURF_MAX = 20;

function schreibenAktiv() { return !!S.schreiben && postenVerbunden(); }
function schreibenEntwuerfe() { return store.get('posten.entwuerfe', []) || []; }
function schreibenZustand() {
  if (!S.postenBuehne) {
    const k = postenKonten(); const e = store.get('posten.entwurf', null);
    S.postenBuehne = { stufe: 'schreiben', art: 'neu', antwort: null, bezug: null, text: (e && e.text) || '', ziele: { mastodon: !!k.mastodon, bluesky: !!k.bluesky }, ergebnis: {}, buehne: true };
  }
  return S.postenBuehne;
}
function schreibenAblegen() {
  const P = schreibenZustand(); if (!P.text.trim()) return;
  const liste = schreibenEntwuerfe().filter((x) => x.text !== P.text);
  liste.unshift({ id: hashId(P.text + Date.now()), text: P.text, at: Date.now() });
  store.set('posten.entwuerfe', liste.slice(0, ENTWURF_MAX));
  P.text = ''; store.set('posten.entwurf', null); render(true); flash(tt('Entwurf abgelegt – nur auf diesem Gerät.'));
}

/* ---------- Antworten an dich (Erwähnungen, Antworten) ---------- */
async function postenBskyLesen(methode, params) {
  const acc = await postenBskyZugang();
  const r = await fetch(POSTEN_BSKY + methode + '?' + new URLSearchParams(params), { headers: { Authorization: 'Bearer ' + acc } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 || d.error === 'ExpiredToken' || d.error === 'InvalidToken') { POSTEN.bskyAccess = ''; throw new PostenAbgelaufen('bluesky'); }
  if (!r.ok) throw new Error(d.message || tt('HTTP ') + r.status);
  return d;
}
async function schreibenAntwortenLaden() {
  if (SCHREIBEN.laden) return;
  SCHREIBEN.laden = true; SCHREIBEN.fehler = ''; render(true);
  const k = postenKonten(); const out = []; const fehler = [];
  if (k.mastodon) {
    try {
      const d = await postenMasto('/api/v1/notifications?limit=20&types[]=mention');
      (Array.isArray(d) ? d : []).forEach((n) => { const s = n.status; if (!s) return; const a = n.account || s.account || {};
        const acct = a.acct && a.acct.includes('@') ? a.acct : (a.acct || '') + '@' + k.mastodon.host;
        out.push({ id: 'm:' + s.uri, service: 'mastodon', who: a.display_name || a.username || acct, handle: '@' + acct, avatar: a.avatar_static, text: htmlToText(s.content || ''), date: s.created_at, link: s.url || s.uri, art: s.in_reply_to_id ? 'antwort' : 'erwaehnung' }); });
    } catch (e) { fehler.push('Mastodon: ' + (e instanceof PostenAbgelaufen ? tt('Deine Anmeldung ist abgelaufen. Bitte verbinde das Konto neu.') : e.message)); }
  }
  if (k.bluesky) {
    try {
      const d = await postenBskyLesen('app.bsky.notification.listNotifications', { limit: '30' });
      (d.notifications || []).filter((n) => ['reply', 'mention', 'quote'].includes(n.reason)).forEach((n) => { const a = n.author || {}; const rkey = String(n.uri).split('/').pop();
        out.push({ id: 'b:' + n.uri, service: 'bluesky', who: a.displayName || a.handle, handle: '@' + a.handle, avatar: a.avatar, text: (n.record && n.record.text) || '', date: n.indexedAt, link: 'https://bsky.app/profile/' + a.handle + '/post/' + rkey, art: n.reason === 'reply' ? 'antwort' : n.reason === 'quote' ? 'zitat' : 'erwaehnung' }); });
    } catch (e) { fehler.push('Bluesky: ' + (e instanceof PostenAbgelaufen ? tt('Deine Anmeldung ist abgelaufen. Bitte verbinde das Konto neu.') : e.message)); }
  }
  out.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  SCHREIBEN.antworten = out.slice(0, 40); SCHREIBEN.fehler = fehler.join(' · '); SCHREIBEN.laden = false; SCHREIBEN.geladenUm = Date.now();
  if (schreibenAktiv()) render(true);
}

/* ---------- Bühne ---------- */
function schreibenBuehne(el) {
  if (!SCHREIBEN.antworten && !SCHREIBEN.laden) setTimeout(schreibenAntwortenLaden, 0);  // nur beim Öffnen, kein Hintergrund-Abruf
  const P = schreibenZustand(); const k = postenKonten();
  const formular = postenFormular(P, { buehne: true, autosave: (t) => store.set('posten.entwurf', t ? { text: t, at: Date.now() } : null) });
  const entw = schreibenEntwuerfe();
  const ART = { antwort: tt('antwortet dir'), erwaehnung: tt('erwähnt dich'), zitat: tt('zitiert dich') };
  const antworten = SCHREIBEN.laden && !SCHREIBEN.antworten ? h('p', { class: 'small add-msg' }, tt('Schaue nach …'))
    : (SCHREIBEN.antworten || []).length ? h('div', { class: 'schreiben-liste' }, SCHREIBEN.antworten.map((p) => h('div', { class: 'add-row schreiben-antwort' },
      avatar({ key: p.service + p.handle, name: p.who, avatar: p.avatar }, 30),
      h('span', { class: 'row-text' }, h('span', { class: 'row-title', style: 'font-size:14px' }, p.who + ' · ' + (ART[p.art] || '')),
        h('span', { class: 'row-sub', style: 'white-space:normal' }, (SERVICE_LABEL[p.service] || p.service) + ' · ' + ago(p.date) + ' – ' + String(p.text).replace(/\s+/g, ' ').slice(0, 220))),
      h('span', { class: 'schreiben-acts' },
        h('button', { type: 'button', class: 'mini', onClick: () => postenOeffnen('antworten', p) }, tt('↩ Antworten')),
        h('a', { class: 'mini linkish', href: p.link, target: '_blank', rel: 'noopener noreferrer' }, tt('Öffnen'))))))
      : h('p', { class: 'small add-msg' }, tt('Gerade nichts Neues an dich.'));
  const root = h('div', { class: 'schreiben' },
    h('div', { class: 'schreiben-kopf' }, h('h1', {}, '✎ ' + tt('Schreiben')),
      h('span', { class: 'small' }, ['mastodon', 'bluesky'].filter((d) => k[d]).map((d) => SERVICE_LABEL[d] + ' @' + (d === 'mastodon' ? k.mastodon.acct : k.bluesky.handle)).join(' · '))),
    h('section', { class: 'card-box schreiben-feld', 'aria-label': tt('Neuer Beitrag') }, formular),
    entw.length ? h('section', { class: 'card-box' }, h('h3', {}, tt('Entwürfe')), h('div', { class: 'schreiben-liste' }, entw.map((e) => h('div', { class: 'add-row' },
      h('span', { class: 'row-text' }, h('span', { class: 'row-sub', style: 'white-space:normal' }, ago(new Date(e.at).toISOString()) + ' – ' + e.text.replace(/\s+/g, ' ').slice(0, 200))),
      h('span', { class: 'schreiben-acts' },
        h('button', { type: 'button', class: 'mini', onClick: () => { const P2 = schreibenZustand(); if (P2.text.trim() && P2.text !== e.text) schreibenAblegen(); P2.text = e.text; P2.stufe = 'schreiben'; store.set('posten.entwuerfe', schreibenEntwuerfe().filter((x) => x.id !== e.id)); render(true); } }, tt('Weiterschreiben')),
        h('button', { type: 'button', class: 'ghost', 'aria-label': tt('Entwurf löschen'), onClick: () => { store.set('posten.entwuerfe', schreibenEntwuerfe().filter((x) => x.id !== e.id)); render(true); } }, icon('close', { sm: true }))))))) : null,
    h('section', { class: 'card-box' }, h('div', { class: 'schreiben-h3' }, h('h3', {}, tt('Antworten an dich')),
      h('button', { type: 'button', class: 'mini', disabled: SCHREIBEN.laden, onClick: schreibenAntwortenLaden }, SCHREIBEN.laden ? tt('Schaue nach …') : tt('Neu nachsehen'))),
      SCHREIBEN.fehler ? h('p', { class: 'small add-msg posten-fehler' }, SCHREIBEN.fehler) : null, antworten));
  el.replaceChildren(root);
}

modusRegistrieren({
  id: 'schreiben', label: tt('Schreiben'),
  aktiv: schreibenAktiv,
  buehne: schreibenBuehne,
  karte: () => null,
  gesten: false,                       // Rad, Wischen, ↑ ↓ blättern hier nicht
  taste: (e) => {                       // Tasten gehören dem Schreibfeld; Esc zurück zur Liste
    if (e.key === 'Escape' && !S.posten) { S.schreiben = false; render(true); return true; }
    return ['ArrowDown', 'ArrowUp', 'j', 'k', ' ', 's', 'n', 'm', 'l', 'f'].includes(e.key);
  },
  verlassen: () => {}
});
