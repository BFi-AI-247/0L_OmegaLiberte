// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Datenmodell: Zusammenführen (Creator, Wege, gleiche Beiträge), build(), loadAll(). Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- Zusammenführen: dieselbe Quelle auf mehreren Diensten ---------
   Stark (automatisch): Bluesky-Domain-Handle = bestätigte Website im Mastodon-Profil,
   eigene Mastodon-Instanz unter dieser Domain, Bridgy-Fed-Brücke, gegenseitiger Profilverweis.
   Schwach (nur Vorschlag, du entscheidest): einseitiger Verweis, gleiche Website, gleicher Name.
   Deine Entscheidungen (ja/nein je Paar) liegen lokal unter „merges“. */
const GENERIC_HOSTS = new Set(['bsky.app', 'bsky.social', 'brid.gy', 'linktr.ee', 'github.com', 'github.io', 'instagram.com', 'youtube.com',
  'x.com', 'twitter.com', 'facebook.com', 'linkedin.com', 'patreon.com', 'ko-fi.com', 'paypal.me', 'tiktok.com', 'threads.net', 'mastodon.social',
  'medium.com', 'substack.com', 't.me', 'wikipedia.org', 'de.wikipedia.org', 'about.me', 'bio.link', 'keyoxide.org']);
function hostOf(u) {
  try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
}
function sameOrSub(hst, d) { return !!hst && !!d && (hst === d || hst.endsWith('.' + d)); }
function normName(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }
function mastoLinks(a) {
  const out = [];
  for (const f of a.fields || []) {
    const doc = new DOMParser().parseFromString(String(f.value || ''), 'text/html');
    const text = (doc.body.textContent || '').trim().toLowerCase();
    const hrefs = [...doc.querySelectorAll('a[href]')].map((x) => x.getAttribute('href'));
    if (!hrefs.length && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) hrefs.push(text);
    const label = String(f.name || '').toLowerCase();
    if (!hrefs.length) out.push({ src: 'feld', host: '', url: '', verified: false, label, text });
    hrefs.forEach((u) => out.push({ src: 'feld', host: hostOf(u), url: String(u).toLowerCase(), verified: !!f.verified_at, label, text }));
  }
  const note = new DOMParser().parseFromString(String(a.note || ''), 'text/html');
  [...note.querySelectorAll('a[href]')].forEach((x) => { const u = x.getAttribute('href'); out.push({ src: 'bio', host: hostOf(u), url: String(u).toLowerCase(), verified: false, label: '', text: '' }); });
  return out;
}
function matchPair(m, b) {
  const [mu, mh] = String(m.acct || m.handle.slice(1)).toLowerCase().split('@');
  const bh = String(b.handle || '').slice(1).toLowerCase();
  const links = m.links || []; const mhay = m.hay || ''; const bhay = b.hay || '';
  if (!mu || !mh || !bh) return null;
  if (bh === mu + '.' + mh + '.ap.brid.gy' || (mh === 'bsky.brid.gy' && mu === bh)) return { level: 'auto', why: tt('Brücke (Bridgy Fed)') };
  const own = bh.endsWith('.bsky.social') || bh.endsWith('.brid.gy') ? '' : bh;
  if (own) {
    if (links.some((l) => l.verified && sameOrSub(l.host, own))) return { level: 'auto', why: tt('bestätigte Website ') + own };
    if (sameOrSub(mh, own)) return { level: 'auto', why: tt('eigene Domain ') + own };
  }
  const mRefB = mhay.includes('bsky.app/profile/' + bh) || (bh.endsWith('.bsky.social') && mhay.includes(bh)) ||
    links.some((l) => /bsky|bluesky/.test(l.label) && (l.text.includes(bh) || l.url.includes(bh)));
  const bRefM = bhay.includes('@' + mu + '@' + mh) || bhay.includes(mh + '/@' + mu);
  if (mRefB && bRefM) return { level: 'auto', why: 'verweisen aufeinander' };
  if (mRefB) return { level: 'vorschlag', why: tt('Mastodon-Profil verweist auf Bluesky') };
  if (bRefM) return { level: 'vorschlag', why: tt('Bluesky-Profil verweist auf Mastodon') };
  if (own && links.some((l) => l.src === 'feld' && sameOrSub(l.host, own))) return { level: 'vorschlag', why: tt('Website ') + own + tt(' (unbestätigt)') };
  const site = links.find((l) => l.src === 'feld' && l.host.length > 4 && !GENERIC_HOSTS.has(l.host) && bhay.includes(l.host));
  if (site) return { level: 'vorschlag', why: tt('gleiche Website ') + site.host };
  const nm = normName(m.name); const nb = normName(b.name);
  if (nm.length >= 3 && nm === nb) return { level: 'vorschlag', why: tt('gleicher Name') };
  return null;
}
function pairKey(a, b) { return [a, b].sort().join('|'); }
/* Wege (RSS, YouTube) einem Creator zuordnen – ohne KI.
   RSS: Bluesky-Handle = Domain der Website, bestätigte Website im Mastodon-Profil, eigene Instanz-Domain → automatisch;
   unbestätigte Website/Profilnennung → Vorschlag. YouTube: Profil verweist auf den Kanal + gleicher Name → automatisch,
   sonst Vorschlag. Zwei Feeds derselben Website → automatisch. Gleicher Name → Vorschlag. */
const GENERIC_SITES = new Set([...GENERIC_HOSTS, 'substack.com', 'wordpress.com', 'blogspot.com', 'tumblr.com', 'ghost.io', 'steadyhq.com', 'podigee.io', 'libsyn.com', 'anchor.fm', 'buzzsprout.com']);
function feedHost(f) {
  const h0 = hostOf(f.site && !/youtube\.com\/?$/.test(f.site) ? f.site : f.url);
  const h1 = h0.replace(/^(feeds?|rss|newsfeed|blog|m)\./, '');
  const parts = h1.split('.'); const base = parts.slice(-2).join('.');
  return GENERIC_SITES.has(base) || GENERIC_SITES.has(h1) ? '' : h1;
}
function youtubeKeys(f) {
  const out = [];
  const id = (/channel_id=(UC[\w-]{22})/.exec(f.url) || /channel\/(UC[\w-]{22})/.exec(f.site || '') || [])[1];
  if (id) out.push('youtube.com/channel/' + id.toLowerCase());
  const hd = (/youtube\.com\/(@[\w.-]+)/i.exec(f.site || '') || [])[1];
  if (hd) out.push('youtube.com/' + hd.toLowerCase());
  return out;
}
function namesMatch(a, b) {
  const x = normName(a); const y = normName(b);
  if (x.length < 3 || y.length < 3) return false;
  if (x === y) return true;
  const [lo, hi] = x.length <= y.length ? [x, y] : [y, x];
  return lo.length >= 5 && hi.includes(lo);
}
function matchFeed(fe, p) {
  const f = fe.feed; const yt = f.kind === 'youtube';
  const nameEq = namesMatch(f.title, p.name);
  if (p.feed) {
    const a = feedHost(f); const b = feedHost(p.feed);
    if (!yt && p.feed.kind !== 'youtube' && a && a === b) return { level: 'auto', why: tt('gleiche Website ') + a };
    return nameEq ? { level: 'vorschlag', why: tt('gleicher Name') } : null;
  }
  const hay = p.hay || ''; const links = p.links || [];
  if (yt) {
    const keys = youtubeKeys(f);
    if (keys.some((k) => hay.includes(k))) return nameEq ? { level: 'auto', why: tt('Profil verweist auf den YouTube-Kanal, gleicher Name') } : { level: 'vorschlag', why: tt('Profil verweist auf den YouTube-Kanal') };
    return nameEq ? { level: 'vorschlag', why: tt('gleicher Name') } : null;
  }
  const fh = feedHost(f);
  if (fh) {
    if (p.service === 'bluesky') {
      const own = String(p.handle || '').slice(1).toLowerCase();
      if (!own.endsWith('.bsky.social') && (own === fh || own.endsWith('.' + fh))) return { level: 'auto', why: tt('Bluesky-Domain ') + own };
    }
    if (p.service === 'mastodon') {
      if (links.some((l) => l.verified && sameOrSub(l.host, fh))) return { level: 'auto', why: tt('bestätigte Website ') + fh };
      const mh = String(p.acct || p.handle || '').split('@').pop().toLowerCase();
      if (mh && (mh === fh || mh.endsWith('.' + fh))) return { level: 'auto', why: tt('eigene Domain ') + fh };
      if (links.some((l) => l.src === 'feld' && sameOrSub(l.host, fh))) return { level: 'vorschlag', why: tt('Website ') + fh + tt(' im Profil') };
    }
    if (hay.includes(fh)) return { level: 'vorschlag', why: tt('Profil nennt ') + fh };
  }
  return nameEq ? { level: 'vorschlag', why: tt('gleicher Name') } : null;
}
function consolidate(people, feeds) {
  const ms = people.filter((p) => p.service === 'mastodon');
  const bs = people.filter((p) => p.service === 'bluesky');
  const edges = []; const sugg = [];
  const consider = (a, b, r) => {
    const k = pairKey(a.key, b.key); const d = S.merges[k];
    if (d === 'nein') return;
    if (d === 'ja' || (r && r.level === 'auto')) edges.push({ k, a: a.key, b: b.key, why: d === 'ja' ? tt('von dir zusammengeführt') : r.why });
    else if (r) sugg.push({ k, a: a.key, b: b.key, why: r.why });
  };
  for (const m of ms) for (const b of bs) consider(m, b, matchPair(m, b));
  const fs = feeds || [];
  fs.forEach((f, i) => {
    for (const p of people) consider(p, f, matchFeed(f, p));
    for (const g of fs.slice(i + 1)) consider(f, g, matchFeed(f, g));
  });
  const par = {};
  const find = (x) => { while (par[x] && par[x] !== x) x = par[x]; return x; };
  edges.forEach((e) => { const ra = find(e.a); const rb = find(e.b); if (ra !== rb) par[rb] = ra; });
  const groups = {};
  edges.forEach((e) => { const r = find(e.a); const g = groups[r] || (groups[r] = { keys: new Set(), edges: [] }); g.keys.add(e.a); g.keys.add(e.b); g.edges.push(e); });
  const grouped = new Set(edges.flatMap((e) => [e.a, e.b]));
  return { groups: Object.values(groups), suggest: sugg.filter((s) => !grouped.has(s.a) && !grouped.has(s.b)) };
}
function personSub(type, services, kompass) {
  return (type === 'kontakt' ? tt('Kontakt') : tt('Creator')) + ' · ' + services.join(', ') + (kompass ? tt(' · in KOMPASS gefolgt') : '');
}
/* Gleiche Beiträge auf Mastodon und Bluesky erkennen – ohne KI.
   Voraussetzung: dieselben bzw. zusammengehörige Absender (zusammengeführt, gleicher Name, Profil-Beleg).
   Dann: derselbe verlinkte Artikel (Host + Pfad, ohne Tracking-Zusätze) binnen 36 h oder sehr ähnlicher Text.
   Ergebnis: ein Beitrag mit Versionen, im Beitrag umschaltbar. */
function postToks(p) {
  return new Set(String((p.text || '') + ' ' + ((p.card && p.card.title) || '')).toLowerCase().replace(/https?:\/\/\S+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
}
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0; a.forEach((w) => { if (b.has(w)) n++; });
  return 2 * n / (a.size + b.size);
}
function authorRel(a, b, people) {
  const ka = a.fromKey || a.whoKey; const kb = b.fromKey || b.whoKey;
  if ((S.alias[ka] || ka) === (S.alias[kb] || kb)) return true;
  if (S.merges[pairKey(ka, kb)] === 'nein') return false;
  if (namesMatch(a.who, b.who)) return true;
  const pa = people[ka]; const pb = people[kb];
  if (!pa || !pb) return false;
  if (pa.feed || pb.feed) { const [f, o] = pa.feed ? [pa, pb] : [pb, pa]; return !!matchFeed(f, o); }
  const [m, bb] = pa.service === 'mastodon' ? [pa, pb] : [pb, pa];
  return m.service === 'mastodon' && bb.service === 'bluesky' && !!matchPair(m, bb);
}
/* Derselbe Beitrag auf mehreren Wegen (Mastodon, Bluesky, Website/RSS, YouTube) → ein Beitrag mit Versionen.
   Anker: derselbe verlinkte Artikel (Host + Pfad) binnen 36 h bei zusammengehörigen Absendern;
   zwischen Mastodon und Bluesky auch sehr ähnlicher Text. Je Weg höchstens eine Version. */
const COMBINE_SERVICES = new Set(['mastodon', 'bluesky', 'rss', 'youtube']);
function crossCombine(list, people) {
  const shared = {};
  const cand = list.filter((p) => COMBINE_SERVICES.has(p.service));
  if (new Set(cand.map((p) => p.service)).size < 2) return { list, shared };
  const tk = new Map(); const tok = (p) => { if (!tk.has(p)) tk.set(p, postToks(p)); return tk.get(p); };
  const pairs = []; const done = new Set();
  const consider = (a, b) => {
    if (a.service === b.service) return;
    const k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
    if (done.has(k)) return; done.add(k);
    if (Math.abs((Date.parse(a.date) || 0) - (Date.parse(b.date) || 0)) > 36 * 3600000) return;
    const link = (a.urls || []).some((u) => (b.urls || []).includes(u));
    const social = (a.service === 'mastodon' || a.service === 'bluesky') && (b.service === 'mastodon' || b.service === 'bluesky');
    const sim = dice(tok(a), tok(b));
    if (!link && !(social && sim >= 0.6)) return;
    // Nur derselbe Absender bzw. zusammengehörige Wege – wer einen fremden Artikel teilt, bleibt eigenständig
    if (!authorRel(a, b, people)) return;
    pairs.push({ a, b, score: (link ? 2 : 1) + sim });
  };
  const byUrl = {};
  cand.forEach((p) => (p.urls || []).forEach((u) => { (byUrl[u] = byUrl[u] || []).push(p); }));
  Object.values(byUrl).forEach((arr) => { if (arr.length <= 40) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) consider(arr[i], arr[j]); });
  const ms = cand.filter((p) => p.service === 'mastodon'); const bs = cand.filter((p) => p.service === 'bluesky');
  for (const m of ms) for (const b of bs) consider(m, b);
  pairs.sort((x, y) => y.score - x.score);
  const cl = new Map(); // Beitrag → Gruppe { posts, services }
  const groupOf = (p) => { if (!cl.has(p.id)) cl.set(p.id, { posts: [p], services: new Set([p.service]) }); return cl.get(p.id); };
  for (const { a, b } of pairs) {
    const ga = groupOf(a); const gb = groupOf(b);
    if (ga === gb || [...gb.services].some((x) => ga.services.has(x))) continue;
    gb.posts.forEach((p) => { ga.posts.push(p); ga.services.add(p.service); cl.set(p.id, ga); });
    const km = a.fromKey || a.whoKey; const kb = b.fromKey || b.whoKey;
    if (a.service !== 'rss' && a.service !== 'youtube' && b.service !== 'rss' && b.service !== 'youtube' && (S.alias[km] || km) !== (S.alias[kb] || kb)) {
      const [mk, bk] = a.service === 'mastodon' ? [km, kb] : [kb, km];
      const k = pairKey(mk, bk); shared[k] = shared[k] || { k, a: mk, b: bk, n: 0 }; shared[k].n += 1;
    }
  }
  const out = new Map(list.map((p) => [p.id, p]));
  new Set(cl.values()).forEach((g) => {
    if (g.posts.length < 2) return;
    const vs = g.posts.slice().sort((x, y) => (Date.parse(x.date) || 0) - (Date.parse(y.date) || 0));
    const first = vs[0];
    out.set(first.id, Object.assign({}, first, { variants: vs, tags: [...new Set(vs.flatMap((v) => v.tags))] }));
    vs.slice(1).forEach((v) => { out.delete(v.id); if (S.seen[sk(v.id)] && !S.seen[sk(first.id)]) S.seen[sk(first.id)] = S.seen[sk(v.id)]; });
  });
  return { list: [...out.values()], shared };
}
function build() {
  const R = S.raw; if (!R) return;
  const entries = Object.assign({}, R.base);
  const byKey = {};
  R.people.forEach((p) => { byKey[p.key] = p; entries[p.key] = Object.assign({ sub: personSub(p.type, [SERVICE_LABEL[p.service]], p.kompass) }, p); });
  const feeds = Object.values(R.base).filter((e) => e.feed);
  feeds.forEach((e) => { byKey[e.key] = e; });
  // Bluesky-Feeds/-Listen sind Sammlungen fremder Konten – nie mit Konten oder Websites zusammenführen
  const { groups, suggest } = consolidate(R.people, feeds.filter((e) => e.feed.kind !== 'bluesky'));
  S.alias = {};
  groups.forEach((g) => {
    const rank = { mastodon: 0, bluesky: 1, youtube: 2, rss: 3 };
    const mem = [...g.keys].map((k) => byKey[k]).filter(Boolean).sort((a, b) => (rank[a.service] ?? 9) - (rank[b.service] ?? 9));
    const key = 'p:' + mem.map((x) => x.key).sort().join('+');
    const type = mem.some((x) => x.type === 'kontakt') ? 'kontakt' : 'creator';
    // Standardname: kürzester Name unter den Konten des wichtigsten Wegs (z. B. „Tagesschau“ statt „Tagesschau Ukraine-Ticker“)
    const best = mem.filter((x) => (rank[x.service] ?? 9) === (rank[mem[0].service] ?? 9)).map((x) => x.name).filter(Boolean).sort((a, b) => a.length - b.length);
    entries[key] = { key, colorKey: mem[0].key, type, service: 'mehrere', name: best[0] || mem[0].name, avatar: (mem.find((x) => x.avatar) || {}).avatar,
      handle: mem.map((x) => x.handle).join(' · '), members: mem, pairs: g.edges.map((e) => e.k),
      why: [...new Set(g.edges.map((e) => e.why))].join(', '),
      sub: personSub(type, [...new Set(mem.map((x) => SERVICE_LABEL[x.service]))]) };
    mem.forEach((x) => {
      S.alias[x.key] = key; delete entries[x.key];
      if (S.favs[x.key]) S.favs[key] = true;
      if (!S.cfg[key] && S.cfg[x.key]) S.cfg[key] = S.cfg[x.key];
    });
  });
  const uniq = {};
  R.posts.forEach((p) => {
    if (!p || !p.id) return;
    const g = S.alias[p.whoKey];
    uniq[p.id] = g ? Object.assign({}, p, { tags: p.tags.concat(g), whoKey: g, fromKey: p.whoKey }) : p;
  });
  const comb = crossCombine(Object.values(uniq).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)), byKey);
  S.posts = comb.list;
  S.byId = {}; S.posts.forEach((p) => { S.byId[p.id] = p; });
  // Konten, die wiederholt dieselben Beiträge posten, als Zusammenführung vorschlagen
  Object.values(comb.shared).forEach((x) => {
    if (S.merges[x.k] || !entries[x.a] || !entries[x.b]) return;
    const why = tt('posten dieselben Beiträge (') + x.n + '×)';
    const ex = suggest.find((g) => g.k === x.k);
    if (ex) ex.why += ', ' + why; else if (x.n >= 2) suggest.push({ k: x.k, a: x.a, b: x.b, why });
  });
  // Selbst festgelegte Namen (auch wenn sich die Zusammensetzung einer Gruppe ändert)
  Object.values(entries).forEach((e) => {
    let nm = S.names[e.key];
    if (!nm && e.members) {
      const mk = new Set(e.members.map((m) => m.key));
      const old = Object.keys(S.names).find((k) => k.startsWith('p:') && k.slice(2).split('+').some((x) => mk.has(x)));
      if (old) nm = S.names[old];
    }
    if (nm) { e.autoName = e.name; e.name = nm; e.customName = true; }
  });
  S.entries = entries; S.suggest = suggest;
  if (S.ai && S.ai.res) aiPrepare();
  if (S.filter && !entries[S.filter]) S.filter = S.alias[S.filter] || null;
  save('favs', 'cfg', 'seen');
}
function decide(pairs, val, msg) {
  pairs.forEach((k) => { S.merges[k] = val; });
  save('merges'); build();
  if (S.cfgKey && !S.entries[S.cfgKey]) S.cfgKey = S.alias[S.cfgKey] || null;
  render(true); if (msg) flash(msg);
}
function suggestFor(mode) {
  return S.suggest.filter((s) => {
    const A = S.entries[s.a]; const B = S.entries[s.b]; if (!A || !B) return false;
    if (mode === 'fav') return S.favs[s.a] || S.favs[s.b];
    return mode !== 'dienst' && (A.type === mode || B.type === mode);
  });
}

/* Zwischenstand beim Laden: höchstens alle 400 ms build(); der erste Beitrag erscheint, sobald eine Quelle fertig ist.
   Danach bleibt der gerade gelesene Beitrag stehen – nur Zähler und Leisten werden neu gezeichnet. */
const ZWISCHEN = { t: 0, extra: null, lauf: null };
function zwischenstand(extraPosts) {
  if (extraPosts && extraPosts.length) (ZWISCHEN.extra = ZWISCHEN.extra || []).push(...extraPosts);
  if (ZWISCHEN.t || !ZWISCHEN.lauf) return;
  ZWISCHEN.t = setTimeout(() => {
    ZWISCHEN.t = 0;
    const L = ZWISCHEN.lauf; if (!L || !S.loading) return;
    S.raw = { base: L.base, people: L.people.slice(), posts: L.posts.concat(ZWISCHEN.extra || []) };
    build();
    const keep = stapelHalten();
    if (!keep) { if (S.posts.length) { S.stack = []; S.pos = -1; next(true); } } else render();
  }, 400);
}
/* Der gelesene Beitrag ist beim Zusammenführen in einen anderen aufgegangen (gleicher Beitrag auf mehreren Wegen)?
   Dann zeigt der Stapel auf diesen – statt zum nächsten Beitrag zu springen. */
// #92: Hat die Quelle den Titel des gerade sichtbaren Beitrags geändert (z. B. Redaktion korrigiert), nur den Titel in der
// Karte ersetzen – die Bühne wird nicht neu gezeichnet, nichts verschiebt sich unter dem Finger (#94)
function titelNachziehen(vorher) {
  const jetzt = cur();
  if (!vorher || !jetzt || !vorher.title || !jetzt.title || vorher.title === jetzt.title || !els.stage) return;
  els.stage.querySelectorAll('.card h1').forEach((e) => { if (e.textContent === vorher.title) e.textContent = jetzt.title; });
}
function stapelHalten() {
  const keep = S.stack[S.pos];
  if (!keep) return null;
  if (S.byId[keep]) return keep;
  const g = S.posts.find((p) => p.variants && p.variants.some((v) => v.id === keep));
  if (g) { S.stack[S.pos] = g.id; return g.id; }
  return null;
}
async function loadAll() {
  if (typeof pruefDatenAktiv === 'function' && pruefDatenAktiv()) { pruefDatenBauen(); return; }  // #74: Vorschau-Beispieldaten statt Netz
  const vorher = cur();  // #92: Titel der gerade sichtbaren Karte nach dem Laden nachziehen
  S.loading = true; S.errors = []; render();
  const base = {}; const posts = []; const people = [];
  ZWISCHEN.lauf = { base, people, posts }; ZWISCHEN.extra = null;
  const radarKeys = Object.keys(RADAR_FEEDS).filter((k) => settings.radar[k]);
  for (const k of radarKeys) base[k] = { key: k, name: RADAR_FEEDS[k], type: 'dienst', service: 'radar', sub: tt('Dienst · RADAR 724') };
  const jobs = radarKeys.map((k) => loadRadar(k).then((ps) => { posts.push(...ps); zwischenstand(); }).catch(() => S.errors.push(RADAR_FEEDS[k] + ' nicht erreichbar')));
  if (settings.mastodon) {
    base.mastodon = { key: 'mastodon', name: tt('Mastodon'), type: 'dienst', service: 'mastodon', sub: tt('Dienst · ') + settings.mastodon };
    jobs.push(loadMastodon(settings.mastodon).then((r) => { people.push(...r.people); posts.push(...r.posts); zwischenstand(); })
      .catch((e) => S.errors.push(tt('Mastodon: ') + e.message)));
  } else if (S.kfollows.some((x) => x.service === 'mastodon')) {
    jobs.push(loadKFOnly('mastodon').then((r) => { people.push(...r.people); posts.push(...r.posts); zwischenstand(); }).catch(() => {}));
  }
  if (settings.bluesky) {
    base.bluesky = { key: 'bluesky', name: tt('Bluesky'), type: 'dienst', service: 'bluesky', sub: tt('Dienst · ') + settings.bluesky };
    jobs.push(loadBluesky(settings.bluesky).then((r) => { people.push(...r.people); posts.push(...r.posts); zwischenstand(); })
      .catch((e) => S.errors.push(tt('Bluesky: ') + e.message)));
  } else if (S.kfollows.some((x) => x.service === 'bluesky')) {
    jobs.push(loadKFOnly('bluesky').then((r) => { people.push(...r.people); posts.push(...r.posts); zwischenstand(); }).catch(() => {}));
  }
  const yts = settings.feeds.filter((f) => f.kind === 'youtube'); const webs = settings.feeds.filter((f) => f.kind !== 'youtube' && f.kind !== 'bluesky');
  if (yts.length) base.youtube = { key: 'youtube', name: 'YouTube', type: 'dienst', service: 'youtube', sub: tt('Dienst · ') + yts.length + (yts.length === 1 ? tt(' Kanal') : tt(' Kanäle')) };
  if (webs.length) base.rss = { key: 'rss', name: tt('Websites & RSS'), type: 'dienst', service: 'rss', sub: tt('Dienst · ') + webs.length + (webs.length === 1 ? tt(' Feed') : tt(' Feeds')) };
  settings.feeds.forEach((f) => { base['f:' + f.id] = feedEntry(f); });
  // Feeds im Sammelabruf (quellen/laden.js); jedes fertige Paket erscheint sofort
  jobs.push(loadFeeds(settings.feeds, zwischenstand).then((r) => { posts.push(...r.posts); S.errors.push(...r.fehler); }));
  await Promise.all(jobs);
  clearTimeout(ZWISCHEN.t); ZWISCHEN.t = 0; ZWISCHEN.extra = null;
  settings.feeds.forEach((f) => { base['f:' + f.id] = feedEntry(f); });
  if (S.feedFix) { S.feedFix = false; save('settings'); }
  ZWISCHEN.lauf = null;
  S.raw = { base, people, posts };
  build();
  S.loading = false;
  const keep = stapelHalten();
  if (!keep) { S.stack = []; S.pos = -1; next(true); } else { render(); titelNachziehen(vorher); }
  if (S.errors.length) flash(S.errors.join(' · '));
  if (S.ai.on && (!S.ai.res || Date.now() - S.ai.res.at > 60 * 60000)) curate(null, 'auto');  // #94: still, Ansicht wechselt nicht von selbst
}
