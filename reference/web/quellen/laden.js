// SPDX-License-Identifier: AGPL-3.0-only
// Quellen – Abruf und Umwandlung: RADAR, Mastodon, Bluesky, RSS/YouTube. Besitzer: Quellen.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- Konnektoren ------------------------------------------------ */
async function loadRadar(key) {
  const d = await getJSON('api/feed.php?quelle=' + encodeURIComponent(key));
  return (d.eintraege || []).map((e) => ({
    id: 'r:' + (e.link || e.titel), service: 'radar', tags: [key],
    who: RADAR_FEEDS[key] || d.titel || tt('RADAR 724'), whoKey: key,
    title: leerPlatzhalter(e.titel), text: ohneAnhaengsel(leerPlatzhalter(e.text)), link: e.link || '', date: e.datum, media: []
  }));
}

function parseMastodon(handle) {
  const m = String(handle || '').trim().replace(/^@/, '').split('@');
  return m.length === 2 && m[0] && m[1] ? { user: m[0], host: m[1].toLowerCase() } : null;
}
function mastoAcct(a, host) { return a.acct.includes('@') ? a.acct : a.acct + '@' + host; }
/* Text mit Links: Liste aus Abschnitten { x: Text, h?: Link, tag?: Erwähnung/Hashtag } */
function shortUrl(u) {
  try { const x = new URL(u); const t = x.hostname.replace(/^www\./, '') + (x.pathname === '/' ? '' : x.pathname); return t.length > 38 ? t.slice(0, 37) + '…' : t; } catch (e) { return String(u || '').slice(0, 38); }
}
function urlKey(u) {
  try {
    const x = new URL(u); let path = x.pathname.replace(/\/+$/, '');
    if (path.length < 8) path += x.search;
    return x.hostname.replace(/^www\./, '').toLowerCase() + path.toLowerCase();
  } catch (e) { return ''; }
}
function richFromHtml(html) {
  const doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
  const segs = [];
  const push = (x, href, tag) => {
    if (!x) return;
    const last = segs[segs.length - 1];
    if (!href && last && !last.h) last.x += x; else segs.push(href ? { x, h: href, tag: tag || undefined } : { x });
  };
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) push(c.nodeValue);
      else if (c.nodeName === 'BR') push('\n');
      else if (c.nodeName === 'A') {
        const href = c.getAttribute('href') || '';
        const tag = /mention|hashtag/.test(c.className || '') || /^[@#]/.test((c.textContent || '').trim());
        let label = c.textContent;
        if (!tag && c.querySelector('.invisible')) label = [...c.childNodes].filter((k) => !(k.classList && k.classList.contains('invisible'))).map((k) => k.textContent).join('') + (c.querySelector('.ellipsis') ? '…' : '');
        if (/^https?:/i.test(href)) push(label || shortUrl(href), href, tag); else push(c.textContent);
      } else { if ((c.nodeName === 'P') && segs.length) push('\n\n'); walk(c); }
    }
  };
  walk(doc.body.firstChild);
  return segs;
}
function richFromBsky(text, facets) {
  if (!facets || !facets.length) return null;
  const enc = new TextEncoder(); const dec = new TextDecoder(); const bytes = enc.encode(String(text || ''));
  const fs = facets.map((f) => ({ s: f.index && f.index.byteStart, e: f.index && f.index.byteEnd, f: (f.features || [])[0] }))
    .filter((f) => f.f && f.e > f.s).sort((a, b) => a.s - b.s);
  const segs = []; let pos = 0;
  for (const f of fs) {
    if (f.s < pos) continue;
    if (f.s > pos) segs.push({ x: dec.decode(bytes.slice(pos, f.s)) });
    const label = dec.decode(bytes.slice(f.s, f.e)); const t = f.f.$type || '';
    if (t.endsWith('#link')) segs.push({ x: label, h: f.f.uri });
    else if (t.endsWith('#mention')) segs.push({ x: label, h: 'https://bsky.app/profile/' + f.f.did, tag: true });
    else if (t.endsWith('#tag')) segs.push({ x: label, h: 'https://bsky.app/hashtag/' + encodeURIComponent(f.f.tag || ''), tag: true });
    else segs.push({ x: label });
    pos = f.e;
  }
  if (pos < bytes.length) segs.push({ x: dec.decode(bytes.slice(pos)) });
  return segs;
}
function linkKeys(rich, card, text) {
  const urls = (rich || []).filter((x) => x.h && !x.tag).map((x) => x.h);
  if (card && card.url) urls.push(card.url);
  if (!rich) (String(text || '').match(/https?:\/\/[^\s<>"]+/g) || []).forEach((u) => urls.push(u));
  return [...new Set(urls.map(urlKey).filter(Boolean))];
}

function mastoPost(st, host, kind) {
  const s = st.reblog || st;
  const a = s.account;
  const acct = mastoAcct(a, new URL(a.url).host || host);
  const rich = richFromHtml(s.content);
  if (s.spoiler_text) rich.unshift({ x: s.spoiler_text + '\n\n' });
  const card = s.card && s.card.url ? { url: s.card.url, title: s.card.title || '', desc: s.card.description || '', image: s.card.image || '' } : null;
  const text = [s.spoiler_text, htmlToText(s.content)].filter(Boolean).join('\n\n');
  return {
    id: 'm:' + s.uri, service: 'mastodon', tags: ['mastodon', 'm:' + acct],
    who: a.display_name || a.username, whoKey: 'm:' + acct, avatar: a.avatar_static, handle: '@' + acct,
    kind, title: '', text, rich, card, urls: linkKeys(rich, card), sprache: (s.language || '').slice(0, 2).toLowerCase() || undefined,  // #69
    link: s.url || s.uri, date: s.created_at,
    media: (s.media_attachments || []).filter((x) => x.type === 'image' || x.type === 'gifv').slice(0, 4).map((x) => x.preview_url),
    mediaGross: (s.media_attachments || []).filter((x) => x.type === 'image' || x.type === 'gifv').slice(0, 4).map((x) => (x.type === 'image' && x.url) || x.preview_url),
    mediaAlt: (s.media_attachments || []).filter((x) => x.type === 'image' || x.type === 'gifv').slice(0, 4).map((x) => x.description || ''),
    note: st.reblog ? 'geteilt von ' + (st.account.display_name || st.account.username) : '',
    videoAnhang: (s.media_attachments || []).some((x) => x.type === 'video') || undefined  // #68: zählt als Video für „Nur Bilder und Videos“
  };
}
// Folgelisten seitenweise (bis 400 bzw. 500 Konten); Beiträge laden zuerst für Favoriten
const MAX_PAGES = 5;
async function mastoPages(url) {
  const all = [];
  for (let i = 0; i < MAX_PAGES && url; i++) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) { if (i === 0) throw new Error(tt('HTTP ') + r.status); break; }
    all.push(...await r.json());
    const m = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get(tt('Link')) || '');
    url = m ? m[1] : null;
  }
  return all;
}
async function bskyPages(url, field) {
  const all = []; let cursor = '';
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await getJSON(url + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    all.push(...(d[field] || []));
    if (!d.cursor || !(d[field] || []).length) break;
    cursor = d.cursor;
  }
  return { [field]: all };
}
function favFirst(people) {
  const fav = (p) => (S.favs[p.key] || S.favs[S.alias[p.key]] || p.kompass ? 0 : 1);
  return people.map((p, i) => [p, i]).sort((a, b) => fav(a[0]) - fav(b[0]) || a[1] - b[1]).map((x) => x[0]);
}
async function loadMastodon(handle) {
  const p = parseMastodon(handle); if (!p) throw new Error(tt('Mastodon-Name im Format @name@instanz eingeben'));
  const base = 'https://' + p.host + '/api/v1/';
  const me = await getJSON(base + 'accounts/lookup?acct=' + encodeURIComponent(p.user));
  const [following, followers] = await Promise.all([
    mastoPages(base + 'accounts/' + me.id + '/following?limit=80'),
    mastoPages(base + 'accounts/' + me.id + '/followers?limit=80').catch(() => [])
  ]);
  const mutual = new Set(followers.map((a) => mastoAcct(a, p.host)));
  const people = following.map((a) => {
    const acct = mastoAcct(a, p.host);
    const links = mastoLinks(a);
    return { key: 'm:' + acct, name: a.display_name || a.username, avatar: a.avatar_static, service: 'mastodon', handle: '@' + acct,
      type: mutual.has(acct) ? 'kontakt' : 'creator', id: a.id, acct: acct.toLowerCase(), links,
      hay: [htmlToText(a.note)].concat(links.map((l) => l.label + ' ' + l.text + ' ' + l.url)).join(' ').toLowerCase() };
  });
  for (const f of S.kfollows.filter((x) => x.service === 'mastodon')) {
    if (!people.some((x) => x.key === f.key)) people.push(Object.assign({ type: 'creator', kompass: true }, f));
  }
  const lists = await pool(favFirst(people).slice(0, MAX_ACCOUNTS + S.kfollows.length), 4, async (pp) => {
    if (pp.kompass || !pp.id) return fetchPersonPosts(pp, 5);
    return (await getJSON(base + 'accounts/' + pp.id + '/statuses?limit=5&exclude_replies=true')).map((st) => mastoPost(st, p.host));
  });
  const posts = lists.flat().filter(Boolean);
  return { people, posts };
}

function bskyPost(fp, kind) {
  const p = fp.post; const a = p.author; const rec = p.record || {};
  const rkey = String(p.uri).split('/').pop();
  const media = [];
  const em = p.embed || {};
  const mediaGross = []; const mediaAlt = [];
  (em.images || (em.media && em.media.images) || []).slice(0, 4).forEach((i) => { media.push(i.thumb); mediaGross.push(i.fullsize || i.thumb); mediaAlt.push(i.alt || ''); });
  const text = rec.text || '';
  const ex = em.external || (em.media && em.media.external);
  const card = ex && ex.uri ? { url: ex.uri, title: ex.title || '', desc: ex.description || '', image: ex.thumb || '' } : null;
  const rich = richFromBsky(text, rec.facets);
  return {
    id: 'b:' + p.uri, service: 'bluesky', tags: ['bluesky', 'b:' + a.handle],
    who: a.displayName || a.handle, whoKey: 'b:' + a.handle, avatar: a.avatar, handle: '@' + a.handle,
    kind, title: '', text, rich, card, urls: linkKeys(rich, card, text), link: 'https://bsky.app/profile/' + a.handle + '/post/' + rkey, sprache: (Array.isArray(rec.langs) && rec.langs[0] ? String(rec.langs[0]).slice(0, 2).toLowerCase() : undefined),  // #69
    date: rec.createdAt || p.indexedAt, media, mediaGross, mediaAlt,
    videoAnhang: /embed\.video/.test(String(em.$type || '') + String((em.media && em.media.$type) || '')) || undefined  // #68
  };
}
async function loadBluesky(handle) {
  const actor = String(handle || '').trim().replace(/^@/, '');
  if (!actor) throw new Error(tt('Bluesky-Namen eingeben'));
  const api = 'https://public.api.bsky.app/xrpc/';
  const [fo, fr] = await Promise.all([
    bskyPages(api + 'app.bsky.graph.getFollows?limit=100&actor=' + encodeURIComponent(actor), 'follows'),
    bskyPages(api + 'app.bsky.graph.getFollowers?limit=100&actor=' + encodeURIComponent(actor), 'followers').catch(() => ({ followers: [] }))
  ]);
  const mutual = new Set((fr.followers || []).map((a) => a.did));
  const people = (fo.follows || []).map((a) => ({ key: 'b:' + a.handle, name: a.displayName || a.handle, avatar: a.avatar,
    service: 'bluesky', handle: '@' + a.handle, type: mutual.has(a.did) ? 'kontakt' : 'creator', did: a.did,
    hay: String(a.description || '').toLowerCase() }));
  for (const f of S.kfollows.filter((x) => x.service === 'bluesky')) {
    if (!people.some((x) => x.key === f.key)) people.push(Object.assign({ type: 'creator', kompass: true }, f));
  }
  const lists = await pool(favFirst(people).slice(0, MAX_ACCOUNTS + S.kfollows.length), 4, (pp) =>
    getJSON(api + 'app.bsky.feed.getAuthorFeed?limit=5&filter=posts_no_replies&actor=' + encodeURIComponent(pp.did || pp.handle.slice(1))));
  const posts = lists.filter(Boolean).flatMap((l) => (l.feed || []).filter((f) => !f.reason)).map((f) => bskyPost(f));
  return { people, posts };
}

/* Bluesky-Feeds, -Listen und Starter-Packs als Quelle (Issue #16, Modul 'bsky-quellen').
   Gespeichert wie ein Feed in settings.feeds: { kind: 'bluesky', art: 'feed'|'liste'|'starter', uri: at://…, url: bsky.app-Adresse }.
   Abruf direkt vom Gerät über public.api.bsky.app (ohne Anmeldung); Beiträge behalten ihre Autoren und tragen den Schlüssel der Quelle als Tag. */
const BSKY_API = 'https://public.api.bsky.app/xrpc/';
const BSKY_ARTEN = { feed: 'app.bsky.feed.generator', liste: 'app.bsky.graph.list', starter: 'app.bsky.graph.starterpack' };
function bskyQuelleErkennen(q) {
  const t = String(q || '').trim();
  let m = /^(?:https?:\/\/)?(?:www\.)?bsky\.app\/profile\/([^/\s]+)\/(feed|lists)\/([A-Za-z0-9._~:-]+)/i.exec(t);
  if (m) return { art: m[2].toLowerCase() === 'feed' ? 'feed' : 'liste', actor: decodeURIComponent(m[1]), rkey: m[3] };
  m = /^(?:https?:\/\/)?(?:www\.)?bsky\.app\/starter-pack(?:-short)?\/([^/\s]+)\/([A-Za-z0-9._~:-]+)/i.exec(t);
  if (m) return { art: 'starter', actor: decodeURIComponent(m[1]), rkey: m[2] };
  m = /^at:\/\/([^/\s]+)\/(app\.bsky\.feed\.generator|app\.bsky\.graph\.list|app\.bsky\.graph\.starterpack)\/([A-Za-z0-9._~:-]+)$/.exec(t);
  if (m) return { art: Object.keys(BSKY_ARTEN).find((k) => BSKY_ARTEN[k] === m[2]), actor: m[1], rkey: m[3] };
  return null;
}
function bskyFehler(e) {
  const m = String((e && e.message) || '');
  return /HTTP 40[13]|Auth/i.test(m) ? tt('Dieser Bluesky-Feed zeigt Beiträge nur angemeldet – ohne Konto kann KOMPASS ihn nicht lesen.')
    : /HTTP 400|HTTP 404|not found/i.test(m) ? tt('Diesen Bluesky-Feed bzw. diese Liste gibt es nicht (mehr).') : tt('Bluesky ist gerade nicht erreichbar.');
}
// Adresse → fertiger Eintrag für settings.feeds (Handle wird zur DID aufgelöst, Name und Bild aus der API)
async function bskyQuelleAufloesen(q) {
  const e = bskyQuelleErkennen(q); if (!e) return null;
  let did = e.actor;
  if (!/^did:/.test(did)) did = (await getJSON(BSKY_API + 'app.bsky.actor.getProfile?actor=' + encodeURIComponent(did))).did;
  const uri = 'at://' + did + '/' + BSKY_ARTEN[e.art] + '/' + e.rkey;
  let title = ''; let icon = ''; let beschreibung = ''; let liste = '';
  if (e.art === 'feed') {
    const v = (await getJSON(BSKY_API + 'app.bsky.feed.getFeedGenerator?feed=' + encodeURIComponent(uri))).view || {};
    title = v.displayName; icon = v.avatar; beschreibung = v.description;
  } else if (e.art === 'liste') {
    const l = (await getJSON(BSKY_API + 'app.bsky.graph.getList?limit=1&list=' + encodeURIComponent(uri))).list || {};
    title = l.name; icon = l.avatar; beschreibung = l.description;
  } else {
    const sp = (await getJSON(BSKY_API + 'app.bsky.graph.getStarterPack?starterPack=' + encodeURIComponent(uri))).starterPack || {};
    title = (sp.record || {}).name; beschreibung = (sp.record || {}).description; liste = (sp.list || {}).uri || (sp.record || {}).list || '';
    if (!liste) throw new Error(tt('Dieses Starter-Pack hat keine öffentliche Liste.'));
  }
  const pfad = e.art === 'feed' ? 'feed/' : e.art === 'liste' ? 'lists/' : '';
  const url = e.art === 'starter' ? 'https://bsky.app/starter-pack/' + did + '/' + e.rkey : 'https://bsky.app/profile/' + did + '/' + pfad + e.rkey;
  const f = { url, title: shortTitle(String(title || BSKY_ART_LABEL()[e.art])), kind: 'bluesky', art: e.art, uri: liste || uri, icon: icon || '', site: url };
  return { feed: f, beschreibung: String(beschreibung || '').replace(/\s+/g, ' ').slice(0, 90) };
}
const BSKY_ART_LABEL = () => ({ feed: tt('Bluesky-Feed'), liste: tt('Bluesky-Liste'), starter: tt('Bluesky-Starter-Pack') });
async function loadBskyQuelle(f) {
  const key = 'f:' + f.id;
  let d;
  try {
    d = f.art === 'feed' ? await getJSON(BSKY_API + 'app.bsky.feed.getFeed?limit=30&feed=' + encodeURIComponent(f.uri))
      : await getJSON(BSKY_API + 'app.bsky.feed.getListFeed?limit=30&list=' + encodeURIComponent(f.uri));
  } catch (e) { throw new Error(bskyFehler(e)); }
  return (d.feed || []).filter((x) => x && x.post && !x.reason).map((x) => { const p = bskyPost(x); p.tags.push(key); return p; });
}

/* RSS/Atom und YouTube über api/rss.php */
function feedEntry(f) {
  if (f.kind === 'bluesky') return { key: 'f:' + f.id, name: f.title, type: 'creator', service: 'bluesky', avatar: f.icon || '', feed: f,
    handle: (BSKY_ART_LABEL()[f.art] || 'Bluesky'), sub: tt('Creator · ') + (BSKY_ART_LABEL()[f.art] || 'Bluesky') };
  const yt = f.kind === 'youtube';
  return { key: 'f:' + f.id, name: f.title, type: 'creator', service: yt ? 'youtube' : 'rss', avatar: f.icon || '', feed: f,
    handle: hostOf(f.site || f.url), sub: tt('Creator · ') + (yt ? 'YouTube' : 'Web/RSS') };
}
async function loadFeed(f) {
  if (f.kind === 'bluesky') return modulAn('bsky-quellen') ? loadBskyQuelle(f) : [];
  return feedPosts(f, await getJSON('api/rss.php?aktion=feed&url=' + encodeURIComponent(f.url)));
}
/* Viele Feeds auf einmal: Pakete zu FEED_PAKET Feeds (Favoriten zuerst), höchstens 3 gleichzeitig über
   rss.php?aktion=sammel. beiTeil(posts) meldet jedes fertige Paket, damit Beiträge schrittweise erscheinen.
   Ergebnis: { posts, fehler: ['<Titel> nicht erreichbar', …] }. Antwortet der Server ohne Sammelabruf,
   wird das Paket einzeln geladen (wie bisher). */
const FEED_PAKET = 6;
async function loadFeeds(feeds, beiTeil) {
  const bsky = feeds.filter((f) => f.kind === 'bluesky'); feeds = feeds.filter((f) => f.kind !== 'bluesky');
  const fav = (f) => (S.favs['f:' + f.id] || S.favs[S.alias['f:' + f.id]] ? 0 : 1);
  const liste = feeds.map((f, i) => [f, i]).sort((a, b) => fav(a[0]) - fav(b[0]) || a[1] - b[1]).map((x) => x[0]);
  const pakete = [];
  for (let i = 0; i < liste.length; i += FEED_PAKET) pakete.push(liste.slice(i, i + FEED_PAKET));
  const posts = []; const fehler = [];
  const melde = (ps) => { posts.push(...ps); if (ps.length && beiTeil) { try { beiTeil(ps); } catch (e) { /* Anzeige darf das Laden nicht stoppen */ } } };
  // Bluesky-Feeds/-Listen direkt vom Gerät (nicht über rss.php), parallel zum Sammelabruf
  const bskyJob = modulAn('bsky-quellen') ? pool(bsky, 3, (f) => loadBskyQuelle(f).then(melde).catch((e) => fehler.push(f.title + ': ' + e.message))) : null;
  await pool(pakete, 3, async (paket) => {
    let d = null;
    try {
      d = await getJSON('api/rss.php?aktion=sammel', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: paket.map((f) => f.url) }) });
    } catch (e) { d = null; }
    if (!d || d.status !== 'ok' || !d.feeds) {
      const ps = [];
      await pool(paket, 4, (f) => loadFeed(f).then((x) => { ps.push(...x); }).catch(() => fehler.push(f.title + tt(' nicht erreichbar'))));
      melde(ps); return;
    }
    const ps = [];
    for (const f of paket) {
      try { ps.push(...feedPosts(f, d.feeds[f.url] || {})); }
      catch (e) { fehler.push(f.title + (d.feeds[f.url] && d.feeds[f.url].status === 'limit' ? tt(': Abrufgrenze erreicht, später erneut') : tt(' nicht erreichbar'))); }
    }
    melde(ps);
  });
  await bskyJob;
  return { posts, fehler };
}
/* Antwort von rss.php (aktion=feed bzw. ein Eintrag aus aktion=sammel) → Beiträge */
// #65: Platzhalter einiger Feeds („NONE“, „null“) nicht als Text zeigen – auch für Einträge aus älterem Server-Puffer
function leerPlatzhalter(t) { t = t || ''; return /^\s*(none|null|undefined|n\/?a|-)\s*$/i.test(t) ? '' : t; }
// #83: Anhängsel am Ende von Feed-Teasern („mehr...“, „Weiterlesen »“, „[…]“, „Read more“, „The post … appeared first on …“) –
// im Feed waren das Links, als reiner Text sehen sie wie ein toter Knopf aus. Nur am Textende; „Artikel öffnen“ führt zum Artikel.
const TEASER_ANHAENGSEL = [
  /\s*\[\s*(?:…|\.{3})\s*\]\s*$/,
  /\s*(?:»\s*)?\b(?:weiterlesen|weiter lesen|mehr lesen|lesen sie mehr|read more|continue reading|zum artikel)\b\s*(?:\.{2,}|…|»|›|>>|→)?\s*$/i,
  /\s*\b(?:mehr|more)\s*(?:\.{2,}|…|»|›|>>|→)\s*$/i,
  /\s*\(\s*(?:mehr|more)\s*\)\s*$/i,
  /\s*the post .{1,300}? appeared first on .{1,200}$/i,
  /\s*der beitrag .{1,300}? erschien zuerst auf .{1,200}$/i
];
function ohneAnhaengsel(t) {
  let s = String(t || ''); const alt = s;
  for (let i = 0; i < 3; i++) {
    let v = s;
    TEASER_ANHAENGSEL.forEach((re) => { v = v.replace(re, ''); });
    v = v.replace(/([.!?…"“”])\s*(?:mehr|more)\s*$/i, '$1');   // „Attacken. mehr“ – nur nach Satzende, „nicht mehr“ bleibt
    if (v === s) break; s = v;
  }
  s = s.trimEnd();
  if (s !== alt.trimEnd() && s && !/[.!?…"“”)»]$/.test(s)) s += ' …';
  return s;
}
// #71: Mastodon-Tag-Zeitleiste (https://<instanz>/tags/<tag>[.rss]) → „#tag (instanz)“, wie in „Quelle hinzufügen“
function mastodonTagTitel(u) {
  const m = /^https:\/\/([^/?#]+)\/tags\/([^/?#.]+)(?:\.rss)?\/?$/i.exec(String(u || ''));
  if (!m) return '';
  try { return '#' + decodeURIComponent(m[2]) + ' (' + m[1].toLowerCase() + ')'; } catch (e) { return ''; }
}
function feedPosts(f, d) {
  if (d.status !== 'ok') throw new Error(d.meldung || tt('Feed nicht lesbar'));
  // YouTube: Der Feed-Titel ist der Kanalname – maßgeblich (behebt z. B. „YouTube“ als Name)
  if (f.kind === 'youtube' && d.titel && f.title !== d.titel) {
    f.title = d.titel; S.feedFix = true;
    if (S.raw && S.raw.base['f:' + f.id]) S.raw.base['f:' + f.id].name = d.titel;
  }
  if (f.kind === 'youtube' && d.seite && !/channel\//.test(f.site || '') && !/@/.test(f.site || '')) f.site = d.seite;
  // #71: RSS-Quelle ohne eigenen Namen (nur der Host als Platzhalter, z. B. aus einem Paket) – Mastodon-Tag als „#tag (instanz)“, sonst Feed-Titel
  if (f.kind !== 'youtube' && (!f.title || f.title === hostOf(f.url))) {
    const t = mastodonTagTitel(f.url) || (d.titel ? shortTitle(d.titel) : '');
    if (t && t !== f.title) { f.title = t; S.feedFix = true; if (S.raw && S.raw.base['f:' + f.id]) S.raw.base['f:' + f.id].name = t; }
  }
  const key = 'f:' + f.id; const yt = f.kind === 'youtube';
  // #20: PeerTube-Feeds (…/feeds/[podcast/]videos.xml) – Einbettung https://<instanz>/videos/embed/<id> (M008)
  const pt = !yt && /\/feeds\/(?:podcast\/)?videos\.xml/.test(f.url || '');
  const ptEmbed = (link) => { const m = pt && /^https:\/\/([^/]+)\/(?:w|videos\/watch)\/([A-Za-z0-9-]{8,40})(?:[?#].*)?$/.exec(link || ''); return m ? 'https://' + m[1] + '/videos/embed/' + m[2] : ''; };
  return (d.eintraege || []).map((e) => ({ ptEmbed: ptEmbed(e.link) || undefined,
    id: e.video ? 'y:' + e.video : 'w:' + (e.link || e.titel), service: yt ? 'youtube' : 'rss', tags: [yt ? 'youtube' : 'rss', key],
    who: f.title || d.titel, whoKey: key, avatar: f.icon || '', handle: hostOf(f.site || f.url), sprache: d.sprache || undefined,  // #69
    title: leerPlatzhalter(e.titel), text: ohneAnhaengsel(leerPlatzhalter(e.text)), link: e.link || '', date: e.datum,
    media: e.bild && !e.video && !e.medien ? [e.bild] : [], video: e.video || null, short: /youtube\.com\/shorts\//.test(e.link || ''), medien: e.medien || null, thumb: e.bild || '', card: null, urls: e.link ? [urlKey(e.link)] : []
  }));
}
// Beiträge eines einzelnen Kontos – Mastodon notfalls direkt von dessen Heim-Instanz
// Fortsetzungszeiger je Konto (nur im Arbeitsspeicher): { base, id, host, max } bzw. { cursor }; ende = nichts Älteres mehr
const SEITEN = {};
async function fetchPersonPosts(m, limit, weiter) {
  const n = limit || 10;
  const sk2 = m.key || (m.service + ':' + m.handle);
  const sp = SEITEN[sk2];
  if (weiter && sp && sp.ende) return [];
  if (m.service === 'mastodon') {
    const acct = String(m.handle || '').replace(/^@/, ''); const [user, home] = acct.split('@');
    const seite = async (base, id, host) => {
      const mx = weiter && sp && sp.base === base && sp.max ? '&max_id=' + encodeURIComponent(sp.max) : '';
      const l = await getJSON(base + 'accounts/' + id + '/statuses?limit=' + n + '&exclude_replies=true' + mx);
      SEITEN[sk2] = { base, id, host, max: l.length ? l[l.length - 1].id : (sp && sp.max), ende: weiter && !l.length };
      return l.map((st) => mastoPost(st, host));
    };
    if (weiter && sp && sp.base) return seite(sp.base, sp.id, sp.host);
    const pm = parseMastodon(settings.mastodon);
    if (pm) {
      try {
        const base = 'https://' + pm.host + '/api/v1/';
        const id = m.id || (await getJSON(base + 'accounts/lookup?acct=' + encodeURIComponent(acct))).id;
        return await seite(base, id, pm.host);
      } catch (e) { /* weiter mit Heim-Instanz */ }
    }
    if (!home) return [];
    const base = 'https://' + home + '/api/v1/';
    const a = await getJSON(base + 'accounts/lookup?acct=' + encodeURIComponent(user));
    return seite(base, a.id, home);
  }
  if (m.service === 'bluesky') {
    const cur = weiter && sp && sp.cursor ? '&cursor=' + encodeURIComponent(sp.cursor) : '';
    const l = await getJSON('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?limit=' + n + '&filter=posts_no_replies&actor=' + encodeURIComponent(m.did || String(m.handle).replace(/^@/, '')) + cur);
    SEITEN[sk2] = { cursor: l.cursor || '', ende: !l.cursor };
    return (l.feed || []).filter((f) => !f.reason).map((f) => bskyPost(f));
  }
  return [];
}
async function loadKFOnly(service) {
  const people = S.kfollows.filter((x) => x.service === service).map((f) => Object.assign({ type: 'creator', kompass: true }, f));
  const lists = await pool(people, 4, (pp) => fetchPersonPosts(pp, 5));
  return { people, posts: lists.flat().filter(Boolean) };
}

async function loadDiscover() {
  const p = parseMastodon(settings.mastodon);
  if (p) {
    const list = await getJSON('https://' + p.host + '/api/v1/trends/statuses?limit=20');
    const known = new Set(Object.keys(S.entries).concat(Object.keys(S.alias)));
    const fresh = list.map((st) => mastoPost(st, p.host, 'neu')).filter((x) => !known.has(x.whoKey) && !S.seen[sk(x.id)]);
    if (fresh.length) return fresh[Math.floor(Math.random() * Math.min(fresh.length, 8))];
  }
  if (settings.bluesky) {
    const d = await getJSON('https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed?limit=20&feed=' +
      encodeURIComponent('at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot'));
    const known = new Set(Object.keys(S.entries).concat(Object.keys(S.alias)));
    const fresh = (d.feed || []).map((f) => bskyPost(f, 'neu')).filter((x) => !known.has(x.whoKey) && !S.seen[sk(x.id)]);
    if (fresh.length) return fresh[Math.floor(Math.random() * Math.min(fresh.length, 8))];
  }
  return null;
}
