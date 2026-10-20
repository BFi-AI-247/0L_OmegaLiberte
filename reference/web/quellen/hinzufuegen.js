// SPDX-License-Identifier: AGPL-3.0-only
// Quellen – Fenster „Quelle hinzufügen“ (KI-Vorschläge, Katalog, Suche je Dienst). Besitzer: Quellen.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- Quelle hinzufügen: Mastodon, Bluesky, YouTube, Website, Katalog ---------- */
const ADD_TABS = [['ki', tt('✦ KI-Vorschläge')], ['katalog', tt('Katalog')], ['mastodon', tt('Mastodon')], ['bluesky', tt('Bluesky')], ['youtube', 'YouTube'], ['web', tt('Website')]];
function openAdd(tab, q) {
  S.add = { tab: tab || (q ? 'bluesky' : 'katalog'), q: q || '', res: [], busy: false, err: '', done: false };
  S.overview = false; S.cfgKey = null; render();
  if (S.add.q && S.add.tab !== 'katalog') runAddSearch();
}
async function runAddSearch() {
  const A = S.add; if (!A) return;
  const q = A.q.trim(); let tab = A.tab; const seq = (A.seq = (A.seq || 0) + 1);
  if (!q || tab === 'katalog') { A.res = []; A.err = ''; A.done = false; render(); return; }
  A.busy = true; A.err = ''; A.res = []; render();
  let res = []; let err = '';
  try {
    // Eindeutige Links (ARD Sounds, Reddit, HN, Tumblr, Micro.blog) gehen immer über die Feed-Suche, egal welcher Reiter offen ist
    const direkt = tab !== 'ki' && (/\b(ardsounds|ardaudiothek)\.de\//i.test(q) || !!quelleErkennen(q));
    if (direkt) tab = 'web';
    if (tab === 'ki') { const v = await kiQuellenVorschlaege(q); res = v.res; A.verworfen = v.verworfen; }
    else if (tab === 'mastodon') res = await searchMastodon(q);
    else if (tab === 'bluesky') {
      const d = await getJSON('https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?limit=15&q=' + encodeURIComponent(q.replace(/^@/, '')));
      res = (d.actors || []).map((a) => ({ kind: 'person', key: 'b:' + a.handle, name: a.displayName || a.handle, avatar: a.avatar, service: 'bluesky',
        handle: '@' + a.handle, did: a.did, sub: '@' + a.handle + (a.description ? ' · ' + String(a.description).replace(/\s+/g, ' ').slice(0, 90) : '') }));
    } else {
      let url = q;
      const qe = tab !== 'youtube' && quelleErkennen(q); // Reddit, Hacker News, Tumblr, Micro.blog: Feed direkt
      if (qe) url = qe.feed;
      if (tab === 'youtube' && !/youtu\.?be/i.test(q)) url = 'https://www.youtube.com/@' + q.replace(/^@/, '').replace(/\s+/g, '');
      const d = await getJSON('api/rss.php?aktion=finden&url=' + encodeURIComponent(url));
      if (d.status !== 'ok') throw new Error(d.meldung || tt('Nichts gefunden.'));
      res = (d.gefunden || []).map((g) => {
        const yt = g.art === 'youtube';
        const title = shortTitle(yt ? (d.name || g.titel) : (g.titel && d.gefunden.length > 1 ? g.titel : d.name || g.titel || hostOf(g.url)));
        return { kind: 'feed', url: g.url, name: title, avatar: d.bild || '', service: yt ? 'youtube' : 'rss', sub: (yt ? 'YouTube-Kanal' : tt('Feed')) + ' · ' + hostOf(d.seite || g.url) + (g.titel && g.titel !== title ? ' · ' + g.titel : ''),
          feed: { url: g.url, title, kind: yt ? 'youtube' : 'rss', icon: d.bild || '', site: d.seite || '' } };
      });
    }
    if (!res.length && tab !== 'ki') err = tt('Nichts gefunden.');
  } catch (e) { err = e.message || tt('Suche fehlgeschlagen.'); }
  if (S.add !== A || A.seq !== seq) return; // inzwischen neue Suche gestartet
  A.res = res; A.err = err; A.busy = false; A.done = true; render();
}
async function searchMastodon(q) {
  const pm = parseMastodon(settings.mastodon);
  const m = /^@?([\w.]+)@([\w.-]+\.[a-z]{2,})$/i.exec(q.trim());
  const toRes = (a, host, ownBase) => {
    const acct = mastoAcct(a, host);
    return { kind: 'person', key: 'm:' + acct, name: a.display_name || a.username, avatar: a.avatar_static, service: 'mastodon', handle: '@' + acct,
      id: ownBase ? a.id : undefined, sub: '@' + acct + (a.followers_count != null ? ' · ' + a.followers_count.toLocaleString('de-DE') + tt(' Follower') : '') };
  };
  if (m) {
    // Vollständige Adresse: direkt bei der Heim-Instanz nachsehen
    const a = await getJSON('https://' + m[2] + '/api/v1/accounts/lookup?acct=' + encodeURIComponent(m[1]));
    return [toRes(a, m[2], pm && pm.host === m[2].toLowerCase())];
  }
  const hosts = [pm ? pm.host : null, 'mastodon.social'].filter((x, i, a) => x && a.indexOf(x) === i);
  for (const host of hosts) {
    try {
      const d = await getJSON('https://' + host + '/api/v2/search?type=accounts&limit=15&resolve=false&q=' + encodeURIComponent(q));
      return (d.accounts || []).map((a) => toRes(a, host, pm && pm.host === host));
    } catch (e) { /* nächste Instanz */ }
  }
  throw new Error(tt('Diese Instanz erlaubt die Suche nur angemeldet. Tipp: vollständige Adresse eingeben, z. B. @name@instanz.'));
}
function isAdded(r) {
  if (r.kind === 'feed') return settings.feeds.some((f) => f.url === r.url);
  return S.kfollows.some((f) => f.key === r.key) || !!S.entries[r.key] || !!S.alias[r.key];
}
async function addPerson(r) {
  if (S.entries[r.key] || S.alias[r.key]) { S.add = null; openCreator(S.alias[r.key] || r.key); return; }
  const f = { key: r.key, name: r.name, avatar: r.avatar, service: r.service, handle: r.handle };
  if (r.id) f.id = r.id; if (r.did) f.did = r.did;
  S.kfollows.push(f); save('kfollows'); render();
  if (S.raw) {
    const posts = await fetchPersonPosts(f, 10).catch(() => []);
    S.raw.people.push(Object.assign({ type: 'creator', kompass: true }, f));
    S.raw.posts.push(...posts); build();
  }
  flash(tt('In KOMPASS gefolgt: ') + r.name); render();
}
async function addFeed(feed) {
  if (settings.feeds.some((f) => f.url === feed.url)) return;
  const f = Object.assign({ id: hashId(feed.url) }, feed);
  settings.feeds.push(f); save('settings'); render();
  if (S.raw) {
    S.raw.base['f:' + f.id] = feedEntry(f);
    const n = settings.feeds.filter((x) => x.kind === f.kind).length;
    if (f.kind === 'youtube') S.raw.base.youtube = { key: 'youtube', name: 'YouTube', type: 'dienst', service: 'youtube', sub: tt('Dienst · ') + n + (n === 1 ? tt(' Kanal') : tt(' Kanäle')) };
    else S.raw.base.rss = { key: 'rss', name: tt('Websites & RSS'), type: 'dienst', service: 'rss', sub: tt('Dienst · ') + n + (n === 1 ? tt(' Feed') : tt(' Feeds')) };
    try { S.raw.posts.push(...await loadFeed(f)); flash(tt('Hinzugefügt: ') + f.title); } catch (e) { flash(f.title + tt(' hinzugefügt, aber gerade nicht erreichbar.')); }
    if (S.feedFix) { S.feedFix = false; save('settings'); S.raw.base['f:' + f.id] = feedEntry(f); }
    build();
  } else flash(tt('Hinzugefügt: ') + f.title);
  render();
}
function removeFeed(id) {
  const f = settings.feeds.find((x) => x.id === id); if (!f) return;
  settings.feeds = settings.feeds.filter((x) => x.id !== id); save('settings');
  const key = 'f:' + id;
  if (S.raw) {
    delete S.raw.base[key]; S.raw.posts = S.raw.posts.filter((x) => x.whoKey !== key);
    if (!settings.feeds.some((x) => x.kind === 'youtube')) delete S.raw.base.youtube;
    if (!settings.feeds.some((x) => x.kind !== 'youtube')) delete S.raw.base.rss;
    build();
  }
  if (S.filter === key) S.filter = null;
  if (S.cfgKey === key) S.cfgKey = null;
  flash(tt('Entfernt: ') + f.title); render(true);
}
function removeKF(key) {
  S.kfollows = S.kfollows.filter((x) => x.key !== key); save('kfollows');
  if (S.raw) {
    const still = (S.raw.people.find((x) => x.key === key && !x.kompass));
    if (!still) { S.raw.people = S.raw.people.filter((x) => x.key !== key); S.raw.posts = S.raw.posts.filter((x) => (x.fromKey || x.whoKey) !== key); }
    build();
  }
  if (S.filter === key) S.filter = null;
  if (S.cfgKey === key) S.cfgKey = null;
  flash(tt('In KOMPASS nicht mehr gefolgt.')); render(true);
}
function renderAdd() {
  const A = S.add;
  const close = () => { S.add = null; render(); };
  const ph = { ki: tt('Thema, z. B. Fußball-Bundesliga, Raumfahrt, Kochen'), mastodon: tt('Name oder @name@instanz'), bluesky: tt('Name oder Handle'), youtube: tt('Kanal-Adresse oder @name'), web: tt('Website oder Feed-Adresse, z. B. heise.de'), katalog: tt('Katalog filtern …') }[A.tab];
  const hint = {
    mastodon: tt('Sucht über ') + ((parseMastodon(settings.mastodon) || {}).host || 'mastodon.social') + '. Du folgst dann in KOMPASS (nur lesend), nicht auf Mastodon selbst.',
    bluesky: tt('Öffentliche Bluesky-Suche. Du folgst dann in KOMPASS (nur lesend), nicht auf Bluesky selbst.'),
    youtube: tt('Kanal-Adresse (youtube.com/@…) oder @name. Suche nach Namen ist ohne YouTube-Schlüssel nicht möglich.'),
    web: tt('KOMPASS sucht auf der Seite nach RSS- oder Atom-Feeds.'),
    katalog: tt('Geprüfte Feeds zum direkten Hinzufügen.'),
    ki: tt('Deine KI schlägt Quellen vor, KOMPASS prüft jede selbst – angezeigt wird nur, was es wirklich gibt.')
  }[A.tab];
  const input = h('input', { id: 'k-add', value: A.q, placeholder: ph, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    onInput: (e) => { A.q = e.target.value; if (A.tab === 'katalog') render(); },
    onKeydown: (e) => { if (e.key === 'Enter') runAddSearch(); else if (e.key === 'Escape') close(); } });
  const row = (r, act) => h('div', { class: 'add-row' }, avatar({ key: r.key || r.url, name: r.name, avatar: r.avatar, service: r.service }, 36),
    h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, r.name), h('span', { class: 'row-sub', title: r.sub }, r.sub)), act);
  const btn = (r) => {
    const done = isAdded(r);
    const onAdd = () => (r.kind === 'feed' ? addFeed(r.feed) : addPerson(r));
    return h('button', { type: 'button', class: 'mini' + (done ? '' : ' primary'), disabled: done && r.kind === 'feed', onClick: done && r.kind !== 'feed' ? () => addPerson(r) : onAdd },
      done ? (r.kind === 'feed' ? tt('✓ Dabei') : tt('Zeigen')) : r.kind === 'feed' ? tt('Hinzufügen') : tt('Folgen'));
  };
  let body;
  if (A.tab === 'katalog') {
    const ql = A.q.toLowerCase().trim();
    body = CATALOG.map((g) => {
      const items = katalogItems(g).filter(([n, u, d]) => !ql || (n + ' ' + d + ' ' + tt(g.gruppe)).toLowerCase().includes(ql));  // eigene Sprache zuerst
      if (!items.length) return null;
      return [h('div', { class: 'side-label small' }, tt(g.gruppe)), items.map(([n, u, d, kind, spr]) => {
        const sprache = katalogSprache([n, u, d, kind, spr]);
        const r = { kind: 'feed', url: u, name: n, service: kind === 'youtube' ? 'youtube' : 'rss', sub: (kind === 'youtube' ? 'YouTube-Kanal' : tt('Feed')) + ' · ' + d + (sprache !== LANG ? ' · ' + sprache.toUpperCase() : ''),
          feed: { url: u, title: n, kind: kind === 'youtube' ? 'youtube' : 'rss', icon: '', site: 'https://' + d + '/' } };
        return row(r, btn(r));
      })];
    });
  } else if (A.busy) body = h('p', { class: 'small add-msg' }, tt('Suche …'));
  else if (A.err) body = h('p', { class: 'small add-msg' }, A.err);
  else if (A.res.length) body = [A.res.map((r) => row(r, btn(r))),
    A.tab === 'ki' && A.verworfen ? h('p', { class: 'small add-msg' }, A.verworfen + (A.verworfen === 1 ? tt(' Vorschlag') : tt(' Vorschläge')) + tt(' nicht auffindbar – verworfen.')) : null];
  else if (A.tab === 'ki' && A.done) body = h('p', { class: 'small add-msg' }, tt('Keiner der Vorschläge ließ sich bestätigen. Versuch ein genaueres Thema.'));
  else body = h('p', { class: 'small add-msg' }, tt('Eingeben und mit Enter oder „Suchen“ starten.'));
  return h('div', { class: 'overlay', onClick: (ev) => { if (ev.target === ev.currentTarget) close(); } },
    h('div', { class: 'bottom-sheet add-sheet', role: 'dialog', 'aria-label': tt('Quelle hinzufügen') },
      h('div', { class: 'add-head' }, h('b', {}, tt('Quelle hinzufügen')), closeBtn(tt('Schließen'), close)),
      h('div', { class: 'add-tabs scrollx', role: 'tablist' }, ADD_TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'filter-pill', 'aria-pressed': A.tab === k ? 'true' : 'false',
        onClick: () => { A.tab = k; A.res = []; A.err = ''; A.done = false; render(); if (A.q.trim() && k !== 'katalog') runAddSearch(); } }, l))),
      h('div', { class: 'add-search' }, h('div', { class: 'search', style: 'flex:1' }, icon('search', { sm: true }), h('label', { for: 'k-add', class: 'sr' }, ph), input),
        A.tab !== 'katalog' ? h('button', { type: 'button', class: 'btn primary', disabled: A.busy, onClick: runAddSearch }, tt('Suchen')) : null),
      h('span', { class: 'small add-hint' }, hint),
      h('div', { class: 'add-list' }, body)));
}

/* Feed-Adresse aus Adresse oder Kurzform (r/de, hn, name.tumblr.com, micro.blog/name). Von Mistral (M006, Karte A005),
   geprüft und ergänzt (Groß-R, Adressen mit ?/#). */
function qe_normal(eingabe) {
  if (typeof eingabe !== 'string') return null;
  var s = eingabe.trim();
  if (s === '') return null;
  s = s.replace(/^https?:\/\//i, '');
  while (/^(www\.|old\.|m\.)/i.test(s)) s = s.replace(/^(www\.|old\.|m\.)/i, '');
  return s;
}
function quelleErkennen(eingabe) {
  var s = qe_normal(eingabe);
  if (s === null) return null;
  var m;
  m = s.match(/^\/?r\/([A-Za-z0-9_]{2,21})([\/?#]|$)/i);
  if (m) return { art: 'reddit', feed: 'https://www.reddit.com/r/' + m[1] + '/.rss', name: 'r/' + m[1] };
  m = s.match(/^reddit\.com\/r\/([A-Za-z0-9_]{2,21})([\/?#]|$)/i);
  if (m) return { art: 'reddit', feed: 'https://www.reddit.com/r/' + m[1] + '/.rss', name: 'r/' + m[1] };
  if (/^news\.ycombinator\.com([\/?#]|$)/i.test(s)) return { art: 'hackernews', feed: 'https://news.ycombinator.com/rss', name: 'Hacker News' };
  if (/^hn$/i.test(s) || /^hacker news$/i.test(s)) return { art: 'hackernews', feed: 'https://news.ycombinator.com/rss', name: 'Hacker News' };
  m = s.match(/^([A-Za-z0-9-]+)\.tumblr\.com([\/?#]|$)/i);
  if (m && m[1].toLowerCase() !== 'www' && m[1].toLowerCase() !== 'api') return { art: 'tumblr', feed: 'https://' + m[1].toLowerCase() + '.tumblr.com/rss', name: m[1] + ' (Tumblr)' };
  m = s.match(/^tumblr\.com\/([A-Za-z0-9-]+)([\/?#]|$)/i);
  if (m && m[1].toLowerCase() !== 'www' && m[1].toLowerCase() !== 'api') return { art: 'tumblr', feed: 'https://' + m[1].toLowerCase() + '.tumblr.com/rss', name: m[1] + ' (Tumblr)' };
  m = s.match(/^([A-Za-z0-9_]+)\.micro\.blog([\/?#]|$)/i);
  if (m) return { art: 'microblog', feed: 'https://' + m[1].toLowerCase() + '.micro.blog/feed.xml', name: m[1] + ' (Micro.blog)' };
  m = s.match(/^micro\.blog\/([A-Za-z0-9_]+)([\/?#]|$)/i);
  if (m) return { art: 'microblog', feed: 'https://' + m[1].toLowerCase() + '.micro.blog/feed.xml', name: m[1] + ' (Micro.blog)' };
  return null;
}
