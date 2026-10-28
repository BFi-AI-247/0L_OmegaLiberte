// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Navigation im Strom: sichtbare Beiträge, weiter/zurück, Auswahl, Suche. Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- Feed-Logik -------------------------------------------------- */
function chronoVisible() {
  const nm = modulAn('nur-medien');
  return S.posts.filter((p) => (S.filter ? p.tags.includes(S.filter) : true) &&
    !p.tags.some((t) => t !== S.filter && !cfgOf(t).show) &&
    !(nm && !hatMedien(p) && p.tags.some((t) => cfgOf(t).nurMedien)) &&
    (typeof spracheErlaubt !== 'function' || spracheErlaubt(p)));  // #69
}
// #68 (Modul nur-medien): Beitrag mit eigenem Bild oder Video – ein Link-Vorschaubild (card) allein zählt nicht
function hatMedien(p) {
  return !!(p && ((p.media && p.media.length) || p.video || p.videoAnhang || p.ptEmbed || p.service === 'youtube' ||
    (p.medien && /video|bild|image/i.test(String(p.medien.art || p.medien.typ || '')))));
}
function visible() {
  const m = aktiverModus();
  // #24: „Markt am Morgen“ einmal am Tag vorne, nur in der chronologischen Ansicht
  const chrono = typeof einstiegOrdnen === 'function' ? einstiegOrdnen(chronoVisible()) : chronoVisible();  // #39 W0: Gifhorn zuerst
  const base = m && m.id === 'social' && typeof marktVorne === 'function' ? marktVorne(chrono) : chrono;
  return m && m.reihenfolge ? m.reihenfolge(base) : base;
}
function markSeen(p) {
  if (!p || S.seen[sk(p.id)]) return;
  if (/^(ai|markt):/.test(String(p.id))) { S.seen[sk(p.id)] = Date.now(); return; }
  S.seen[sk(p.id)] = Date.now();
  if (S.day.d !== today()) { S.day = { d: today(), n: 0 }; S.nextPauseAt = settings.pauseAfter || 0; }  // über Mitternacht offen
  S.day.n += 1; S.total += 1;
  S.history.unshift({ id: p.id, t: Date.now() });
  S.history = S.history.slice(0, 500);
  S.cache[p.id] = { id: p.id, service: p.service, tags: p.tags, who: p.who, whoKey: p.whoKey, avatar: p.avatar, handle: p.handle,
    title: p.title, text: String(p.text || '').slice(0, 1200), link: p.link, date: p.date, media: (p.media || []).slice(0, 1),
    rich: p.rich && JSON.stringify(p.rich).length < 4000 ? p.rich : undefined, card: p.card || undefined };
  (p.variants || []).forEach((v) => { if (!S.seen[sk(v.id)]) S.seen[sk(v.id)] = Date.now(); });
  const keys = Object.keys(S.cache); if (keys.length > 500) keys.slice(0, keys.length - 500).forEach((k) => delete S.cache[k]);
  const seenKeys = Object.keys(S.seen); if (seenKeys.length > 3000) seenKeys.sort((a, b) => S.seen[a] - S.seen[b]).slice(0, 1000).forEach((k) => delete S.seen[k]);
  save('seen', 'day', 'total', 'history', 'cache');
  if (settings.pauseAfter > 0 && S.day.n >= S.nextPauseAt) { S.pause = true; S.pauseDone = false; }
}
function show(id, dir, silent) {
  if (S.pos >= 0 && S.stack[S.pos] === id) return;
  S.stack = S.stack.slice(0, S.pos + 1).concat([id]); S.pos = S.stack.length - 1;
  S.dir = silent ? '' : dir; S.ended = false;
  closeTransient();
  markSeen(S.byId[id] || S.cache[id]);
  render(true);
}
function inView(id) {
  const p = S.byId[id] || S.cache[id];
  if (!p) return false;
  return !S.filter || (p.tags || []).includes(S.filter);
}
function next(silent) {
  // Vorwärts im schon angesehenen Stapel – aber nur, was zur aktuellen Auswahl passt
  while (S.pos < S.stack.length - 1) {
    if (inView(S.stack[S.pos + 1])) { S.pos += 1; S.dir = 'up'; S.ended = false; closeTransient(); render(true); return; }
    S.stack.splice(S.pos + 1, 1);
  }
  const list = visible();
  if (!list.length && S.pos < 0) { S.ended = false; render(true); return; }
  const curId = S.stack[S.pos];
  let p = list.find((x) => !S.seen[sk(x.id)] && x.id !== curId);
  // Bei Auswahl einer Quelle auch Gesehenes durchblättern: der nächst ältere Beitrag
  if (!p && S.filter) { const i = list.findIndex((x) => x.id === curId); p = list[i + 1] || null; }
  if (p) { show(p.id, 'up', silent); if (S.filter) mehrLaden(S.filter, true); return; }
  if (S.pos < 0 && list.length) { show(list[0].id, 'up', true); return; }
  // Ende einer Auswahl: erst Ältere nachladen (Mastodon/Bluesky), dann weiterblättern
  if (S.filter && kannMehr(S.filter)) { mehrLaden(S.filter).then((n) => { if (n) next(silent); else { S.ended = true; S.dir = 'up'; render(true); } }); S.ended = true; S.dir = 'up'; render(true); return; }
  S.ended = true; S.dir = 'up'; render(true);
}
// Ältere Beiträge einer Auswahl nachladen: nur Konten mit Seiten (Mastodon, Bluesky); Feeds liefern nur ihr festes Fenster
const MEHR = { laeuft: {}, ende: {} };
function mehrMitglieder(key) { const e = S.entries[key]; return e ? (e.members || [e]).filter((m) => m.service === 'mastodon' || m.service === 'bluesky') : []; }
function kannMehr(key) { return !MEHR.ende[key] && mehrMitglieder(key).length > 0; }
async function mehrLaden(key, vorab) {
  if (!S.raw || MEHR.laeuft[key] || !kannMehr(key)) return 0;
  if (vorab) { // im Hintergrund, sobald nur noch wenige ungesehene Beiträge übrig sind
    const list = visible(); const i = list.findIndex((x) => x.id === S.stack[S.pos]);
    if (i < 0 || list.length - i > 4) return 0;
  }
  MEHR.laeuft[key] = true; if (!vorab) render(true);
  let neu = 0;
  try {
    const lists = await Promise.all(mehrMitglieder(key).map((m) => fetchPersonPosts(m, 20, true).catch(() => [])));
    const have = new Set(S.raw.posts.map((x) => x.id));
    lists.flat().forEach((x) => { if (!have.has(x.id)) { S.raw.posts.push(x); have.add(x.id); neu++; } });
    if (!neu) MEHR.ende[key] = true;
    if (neu) build();
  } finally { MEHR.laeuft[key] = false; }
  if (!vorab || neu) render(!vorab);
  return neu;
}
function back() {
  if (S.ended) { S.ended = false; S.dir = 'down'; render(true); return; }
  let j = S.pos - 1;
  while (j >= 0 && !inView(S.stack[j])) j--;
  if (j >= 0) { S.pos = j; S.dir = 'down'; closeTransient(); render(true); return; }
  if (S.filter) {
    // Nichts davor in dieser Auswahl: zum nächst neueren Beitrag der Quelle
    const list = visible(); const i = list.findIndex((x) => x.id === S.stack[S.pos]);
    if (i > 0) { S.stack.splice(Math.max(S.pos, 0), 0, list[i - 1].id); S.dir = 'down'; closeTransient(); markSeen(list[i - 1]); render(true); }
  }
}
function shuffle() {
  const list = visible().filter((x) => x.id !== S.stack[S.pos]);
  if (!list.length) { flash(tt('Noch nichts zum Mischen da.')); return; }
  show(list[Math.floor(Math.random() * list.length)].id, 'up');
}
async function discover() {
  if (!settings.mastodon && !settings.bluesky) { flash(tt('„Neues“ braucht eine verbundene Mastodon- oder Bluesky-Quelle (Einstellungen).')); return; }
  flash(tt('Suche etwas Neues …'));
  try {
    const p = await loadDiscover();
    if (!p) { flash(tt('Gerade nichts Neues gefunden.')); return; }
    S.byId[p.id] = p; show(p.id, 'up'); S.toast = '';
  } catch (e) { flash(tt('Neues konnte nicht geladen werden.')); }
}
async function loadEntryPosts(key) {
  const e = S.entries[key]; if (!e || !S.raw) return 0;
  const lists = await Promise.all((e.members || [e]).map((m) => fetchPersonPosts(m, 10).catch(() => [])));
  const got = lists.flat();
  const have = new Set(S.raw.posts.map((x) => x.id));
  got.forEach((x) => { if (!have.has(x.id)) S.raw.posts.push(x); });
  S.fetched[key] = true;
  if (got.length) build();
  return got.length;
}
async function select(key, toggle) {
  S.filter = toggle && S.filter === key ? null : key;
  S.overview = false;
  S.stack = S.stack.slice(0, S.pos + 1);
  let list = visible();
  const e = S.filter ? S.entries[S.filter] : null;
  // Quelle ohne (genug) geladene Beiträge: gezielt nachladen
  if (e && e.type !== 'dienst' && !S.fetched[S.filter] && list.length < 3) {
    flash(tt('Lade Beiträge von ') + e.name + ' …'); render();
    await loadEntryPosts(S.filter); list = visible(); S.toast = '';
  }
  const c = cur();
  if (list.length && (!c || !list.some((x) => x.id === c.id))) {
    const p = list.find((x) => !S.seen[sk(x.id)]) || list[0];
    show(p.id, 'up');
  } else if (!list.length && S.filter) { S.ended = true; S.dir = 'up'; render(true); }
  else render(true);
}
function openCreator(key) {
  const e = S.entries[key];
  if (!e) { flash(tt('Dieser Quelle folgst du noch nicht – unten im Beitrag „In KOMPASS folgen“.')); return; }
  if (S.filter === key) { S.cfgKey = key; render(); return; }
  if (!(S.mode === 'fav' && S.favs[key])) S.mode = e.type;
  select(key, false);
  flash(tt('Beiträge von ') + e.name + tt(' – nochmal antippen für Einstellungen.'));
}
function closeTransient() { S.chatOpen = false; S.factOpen = false; S.msgs = []; S.playing = null; }

function unread(key) {
  if (!cfgOf(key).count) return 0;
  const since = S.countMode === 0 ? S.prevOpen : S.countMode === 1 ? Date.now() - 86400000 : 0;
  return S.posts.filter((p) => p.tags.includes(key) && !S.seen[sk(p.id)] && (Date.parse(p.date) || 0) >= since).length;
}
function searchKeys(q) {
  const n = normName(q); const l = q.toLowerCase().trim();
  return Object.keys(S.entries).filter((k) => {
    const e = S.entries[k];
    const hay = [e.name, e.handle, e.sub].concat((e.members || []).map((m) => m.name + ' ' + m.handle)).join(' ');
    return hay.toLowerCase().includes(l) || (n.length >= 2 && normName(hay).includes(n));
  }).sort((a, b) => unread(b) - unread(a));
}
function viewKeys() { return S.eq.trim() ? searchKeys(S.eq) : keysFor(S.mode); }
function entrySearch() {
  return h('div', { class: 'search entry-search' }, icon('search', { sm: true }), h('label', { for: 'k-esearch', class: 'sr' }, tt('Quelle suchen')),
    h('input', { id: 'k-esearch', placeholder: tt('Quelle suchen – alle Gruppen …'), value: S.eq, autocomplete: 'off', spellcheck: 'false',
      onInput: (ev) => { S.eq = ev.target.value; render(); },
      onKeydown: (ev) => { if (ev.key === 'Escape') { S.eq = ''; render(); } else if (ev.key === 'Enter') { const k = viewKeys()[0]; if (k) { S.eq = ''; openCreator(k); } } } }),
    S.eq ? h('button', { type: 'button', class: 'ghost', style: 'width:32px;height:32px', 'aria-label': tt('Suche leeren'), onClick: () => { S.eq = ''; render(); } }, icon('close', { sm: true })) : null);
}
function keysFor(mode) {
  const ks = Object.keys(S.entries).filter((k) => mode === 'fav' ? S.favs[k] : S.entries[k].type === mode);
  return ks.sort((a, b) => unread(b) - unread(a));
}
