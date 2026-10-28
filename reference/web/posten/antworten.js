// Antworten an Karten (Issue #23, Modul antworten): „Antworten ansehen“ unter Mastodon-/Bluesky-Beiträgen. Erst der Druck holt den
// Gesprächsverlauf (Mastodon /api/v1/statuses/:id/context beim Herkunftsserver, Bluesky getPostThread über public.api.bsky.app),
// direkt vom Gerät, ohne Anmeldung, ohne Zahlen, nichts im Hintergrund. Ergebnis nur im Arbeitsspeicher.
// Dazu (Modul ich-creator): im Reiter Konten „Mich als Creator hinzufügen“ – die eigenen Beiträge erscheinen wie bei jedem Creator.
const ANTW = {};  // id → { stufe: 'lade'|'da'|'fehler', liste: [{ wer, text, link }], text }
const ANTW_MAX = 20;
function antwortVariante(p) { const vs = p.variants || [p]; return vs[typeof variantIndex === 'function' ? variantIndex(p) : 0] || p; }
async function antwortenLaden(v) {
  if (v.service === 'mastodon') {
    const m = /^https:\/\/([^/]+)\/(?:@[^/]+|users\/[^/]+\/statuses)\/(\d+)/.exec(v.link || '');
    if (!m) throw new Error(tt('Für diesen Beitrag finde ich keinen Gesprächsverlauf.'));
    const d = await getJSON('https://' + m[1] + '/api/v1/statuses/' + m[2] + '/context');
    return (d.descendants || []).slice(0, ANTW_MAX).map((s) => ({ wer: (s.account && (s.account.display_name || s.account.acct)) || '', text: htmlToText(s.content || ''), link: s.url || s.uri }));
  }
  const uri = String(v.id || '').replace(/^b:/, '');
  const d = await getJSON('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?depth=1&parentHeight=0&uri=' + encodeURIComponent(uri));
  return ((d.thread && d.thread.replies) || []).filter((r) => r && r.post).slice(0, ANTW_MAX).map((r) => {
    const a = r.post.author || {}; const rkey = String(r.post.uri).split('/').pop();
    return { wer: a.displayName || a.handle || '', text: String((r.post.record || {}).text || ''), link: 'https://bsky.app/profile/' + a.handle + '/post/' + rkey };
  });
}
async function antwortenHolen(p) {
  const v = antwortVariante(p); const z = ANTW[v.id] = { stufe: 'lade' }; render(true);
  try { z.liste = await antwortenLaden(v); z.stufe = 'da'; } catch (e) { z.stufe = 'fehler'; z.text = e.message || tt('Antworten gerade nicht erreichbar.'); }
  render(true);
}
function antwortenZusatz(p, ort) {
  if (ort !== 'unten' || !p) return null;
  const v = antwortVariante(p);
  if (v.service !== 'mastodon' && v.service !== 'bluesky') return null;
  const z = ANTW[v.id];
  if (!z) return h('button', { type: 'button', class: 'mini antw-knopf', onClick: () => antwortenHolen(p) }, tt('Antworten ansehen'));
  if (z.stufe === 'lade') return h('p', { class: 'small antw-info' }, tt('Lade Antworten …'));
  if (z.stufe === 'fehler') return h('p', { class: 'small antw-info' }, z.text);
  if (!z.liste.length) return h('p', { class: 'small antw-info' }, tt('Noch keine Antworten.'));
  return h('section', { class: 'antw-liste', 'aria-label': tt('Antworten') },
    z.liste.map((a) => h('div', { class: 'antw' }, h('b', {}, a.wer), ' ', h('span', {}, a.text.length > 400 ? a.text.slice(0, 400) + ' …' : a.text),
      a.link ? h('a', Object.assign({ class: 'antw-link', href: a.link, 'aria-label': tt('Antwort öffnen') }, EXT), ' ↗') : null)));
}
modusRegistrieren({ id: 'antworten', label: tt('Antworten'), aktiv: () => false, kartenZusatz: antwortenZusatz });
// Konten: sich selbst als Creator hinzufügen (eigene Beiträge wie bei jedem Creator, ohne Zahlen)
function ichAlsCreator(dienst) {
  if (!modulAn('ich-creator')) return null;
  const k = postenKonten()[dienst]; if (!k) return null;
  const r = dienst === 'mastodon'
    ? { kind: 'person', key: 'm:' + k.acct, name: k.acct.split('@')[0], service: 'mastodon', handle: '@' + k.acct }
    : { kind: 'person', key: 'b:' + k.handle, name: k.handle, service: 'bluesky', handle: '@' + k.handle, did: k.did };
  const da = S.kfollows.some((f) => f.key === r.key) || !!S.entries[r.key];
  return h('button', { type: 'button', class: 'mini', disabled: da, onClick: () => addPerson(r) }, da ? tt('Du bist in der Creator-Liste ✓') : tt('Mich als Creator hinzufügen'));
}
