// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Hilfen (h, icon, getJSON …) und Zustand (settings, S, Speichern). Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* =====================================================================
   KOMPASS – Prototyp v0 (Web-App)
   Alle persönlichen Daten (Einstellungen, Verlauf, Likes, Favoriten)
   bleiben im Browser dieses Geräts (localStorage). Das Backend sieht
   nur Feed-Abrufe (RADAR) und – nach Freigabe – Fragen an den Agenten.
   ===================================================================== */
'use strict';

/* ---------- Hilfen ---------------------------------------------------- */
const VERSION = 'v0.89';
const LS = 'kompass.v0.' + (INSTANZ.speicher ? INSTANZ.speicher + '.' : '');
// Modul-Schalter (instanz.js → module): false zieht ein Feature zurück, fehlt = an
function modulAn(id) { return !(INSTANZ.module && INSTANZ.module[id] === false); }
// #5: Öffentliche KI-Probe über das Backend (kurator.php/ai.php) – aus, wenn die Instanz module: { 'ki-probe': false } setzt
// #5 Einladungscode (Modul ki-einladung): ein persönlicher Link …#einladung=<code> schaltet die KI über das Backend frei
// (Budget des Betreibers, 50 Anfragen je Code und Tag). Der Code bleibt nur auf diesem Gerät (store kiEinladung, nicht im Abgleich).
function kiEinladung() { return modulAn('ki-einladung') ? String(store.get('kiEinladung', '') || '') : ''; }
function kiProbeErlaubt() { return modulAn('ki-probe') || !!kiEinladung(); }
function kiServerKopf() { const c = kiEinladung(); return Object.assign({ 'Content-Type': 'application/json' }, c ? { 'X-KOMPASS-Einladung': c } : {}); }
// Aus der Adresse übernehmen und entfernen; ein W0-Einstieg im selben Link bleibt stehen (#einstieg=w0&einladung=…)
function einladungAusAdresse() {
  const m = /(?:^#|&)einladung=([A-Za-z0-9_-]{6,64})/.exec(location.hash || ''); if (!m || !modulAn('ki-einladung')) return false;
  store.set('kiEinladung', m[1]);
  const rest = (location.hash || '').replace(/^#/, '').split('&').filter((t) => !/^einladung=/.test(t)).join('&');
  history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : ''));
  return true;
}
const KI_OHNE = () => tt('Verbinde deine eigene KI (Einstellungen → KI) – ohne eigene KI gibt es hier keine KI-Funktion.');
const store = {
  get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* voll oder gesperrt */ } },
  clear() { try { Object.keys(localStorage).filter((k) => k.startsWith(LS)).forEach((k) => localStorage.removeItem(k)); } catch (e) {} }
};

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

const PATHS = {
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'],
  share: ['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7', 'M16 6l-4-4-4 4', 'M12 2v13'],
  mark: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
  up: ['M18 15l-6-6-6 6'], down: ['M6 9l6 6 6-6'],
  shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  star: ['M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z'],
  search: ['M21 21l-4.3-4.3'],
  settings: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4L21 8', 'M21 3v5h-5'],
  question: ['M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01'],
  all: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  liste: ['M4 6h.01', 'M4 12h.01', 'M4 18h.01', 'M9 6h11', 'M9 12h11', 'M9 18h11'],
  stift: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z']
};
function icon(name, opts = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ic' + (opts.filled ? ' filled' : '') + (opts.sm ? ' sm' : ''));
  if (name === 'question' || name === 'search') {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', name === 'search' ? '11' : '12'); c.setAttribute('cy', name === 'search' ? '11' : '12');
    c.setAttribute('r', name === 'search' ? '8' : '10'); svg.appendChild(c);
  }
  for (const d of PATHS[name] || []) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); svg.appendChild(p); }
  return svg;
}

const TONES = ['#1F5F8B', '#2F6B4F', '#8A4B2A', '#5A4A8A', '#9A3F6B', '#1D6FB0', '#8A5A12', '#4B4FA8', '#3E6B6B', '#7A3E3E'];
function tone(s) { let n = 0; for (const ch of String(s)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return TONES[n % TONES.length]; }
function initial(s) { const t = String(s || '?').replace(/^[@#]/, '').trim(); return (t[0] || '?').toUpperCase(); }
function htmlToText(html) {
  const doc = new DOMParser().parseFromString('<div>' + String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n') + '</div>', 'text/html');
  return (doc.body.textContent || '').trim();
}
function ago(iso) {
  const t = Date.parse(iso || ''); if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  const vor = LANG === 'de' ? 'vor ' : '';
  if (m < 1) return tt('gerade eben');
  if (m < 60) return vor + m + tt(' Min.');
  const h2 = Math.round(m / 60); if (h2 < 24) return vor + h2 + tt(' Std.');
  const d = Math.round(h2 / 24); if (d < 7) return vor + d + (d === 1 ? tt(' Tag') : tt(' Tagen'));
  return new Date(t).toLocaleDateString(LANG === 'de' ? 'de-DE' : 'en-US');
}
function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
async function getJSON(url, opts) {
  const r = await fetch(url, Object.assign({ headers: { Accept: 'application/json' } }, opts || {}));
  if (!r.ok) throw new Error(tt('HTTP ') + r.status);
  return r.json();
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  async function worker() { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/* ---------- Zustand --------------------------------------------------- */
const RADAR_FEEDS = ttFest(() => { const r = {
  'radar': tt('RADAR 724'),
  'radar-gifhorn': tt('Wiesenzeitung Gifhorn'),
  'radar-borkum': tt('Wattpost Borkum'),
  'radar-idstein': tt('Idsteiner Hexenpost')
};
for (const k of Object.keys(r)) if (!INSTANZ.radar.includes(k)) delete r[k];  // nur die Dienste dieser Instanz
return r; });
const FACT = ttFest(() => ({
  grau: { label: tt('ungeprüft'), color: 'var(--f-grau)' },
  gruen: { label: tt('bestätigt'), color: 'var(--f-gruen)' },
  rot: { label: tt('irreführend / falsch'), color: 'var(--f-rot)' },
  satire: { label: tt('Satire / Humor'), color: 'var(--f-satire)' },
  offen: { label: tt('fraglich / nicht prüfbar'), color: 'var(--f-grau)' }
}));
const MAX_ACCOUNTS = 25;
const SERVICE_LABEL = ttFest(() => ({ radar: tt('RADAR 724'), mastodon: tt('Mastodon'), bluesky: tt('Bluesky'), youtube: 'YouTube', rss: 'Web/RSS' }));
// Startkatalog: geprüfte Feeds (18./19.10.2026 über api/rss.php abgerufen; Podcasts, Sport, Kultur, Lifestyle aus M001, geprüft mit dem Quellen-Prüfstand;
// englische Einträge (5. Feld 'en') aus M016, Prüfstand 21.10.2026; RADAR-Quellen aus M018, Prüfstand 21.10.2026 (#13) –
// Unternehmens- und Behördenquellen tragen den Absender im Namen (Sorgfaltsregel RADAR))
const CATALOG = [
  { gruppe: 'Nachrichten', items: [
    ['Tagesschau', 'https://www.tagesschau.de/index~rss2.xml', 'tagesschau.de'],
    ['ZDFheute', 'https://www.zdfheute.de/rss/zdf/nachrichten', 'zdfheute.de'],
    ['Deutschlandfunk', 'https://www.deutschlandfunk.de/nachrichten-100.rss', 'deutschlandfunk.de'],
    ['DER SPIEGEL', 'https://www.spiegel.de/schlagzeilen/index.rss', 'spiegel.de'],
    ['DIE ZEIT', 'https://newsfeed.zeit.de/index', 'zeit.de'],
    ['taz', 'https://taz.de/!p4608;rss/', 'taz.de'],
    ['BBC News – World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'bbc.co.uk'],
    ['The Guardian – World', 'https://www.theguardian.com/world/rss', 'theguardian.com'],
    ['Sky News', 'https://feeds.skynews.com/feeds/rss/home.xml', 'news.sky.com', 'rss', 'en'],
    ['NPR News', 'https://feeds.npr.org/1001/rss.xml', 'npr.org', 'rss', 'en'],
    ['Al Jazeera English', 'https://www.aljazeera.com/xml/rss/all.xml', 'aljazeera.com', 'rss', 'en'],
    ['RTÉ News', 'https://www.rte.ie/feeds/rss/?index=/news/', 'rte.ie', 'rss', 'en'],
    ['Süddeutsche Zeitung', 'https://rss.sueddeutsche.de/rss/Topthemen', 'sueddeutsche.de'],
    ['n-tv', 'https://www.n-tv.de/rss', 'n-tv.de'],
    ['Deutsche Welle', 'https://rss.dw.com/rdf/rss-de-all', 'dw.com'],
    ['ORF', 'https://rss.orf.at/news.xml', 'orf.at'],
    ['Euronews', 'https://www.euronews.com/rss', 'euronews.com', 'rss', 'en'],
    ['Le Monde', 'https://www.lemonde.fr/rss/une.xml', 'lemonde.fr', 'rss', 'fr'],
    ['DW Español', 'https://rss.dw.com/rdf/rss-sp-all', 'dw.com', 'rss', 'es']] },
  { gruppe: 'Podcasts', items: [
    ['Dlf – Die Nachrichten', 'https://www.deutschlandfunk.de/nachrichten-108.xml', 'deutschlandfunk.de'],
    ['Dlf – Der Tag', 'https://www.deutschlandfunk.de/podcast-104.xml', 'deutschlandfunk.de'],
    ['Lage der Nation', 'https://lagedernation.org/feed/mp3/', 'lagedernation.org'],
    ['MDR – Was tun, Herr General?', 'https://www.mdr.de/nachrichten/podcast/general/russland-angriff-krieg-ukraine-mdr-100.xml', 'mdr.de'],
    ['Dlf – Forschung aktuell', 'https://www.deutschlandfunk.de/forschung-aktuell-104.xml', 'deutschlandfunk.de'],
    ['Hörsaal (Dlf Nova)', 'https://www.deutschlandfunknova.de/podcast/hoersaal-der-podcast', 'deutschlandfunknova.de'],
    ['Senkrechtstarter (Raumfahrt)', 'https://senkrechtstarter.podigee.io/feed/mp3', 'podigee.io'],
    ['WDR 2 Einfach Fußball', 'https://www1.wdr.de/mediathek/audio/wdr2/wdr2-bundesliga-togo/bundesliga-togo-102.podcast', 'wdr.de'],
    ['Dlf Sport', 'https://www.deutschlandfunk.de/sport-aktuell-podcast-100.xml', 'deutschlandfunk.de'],
    ['Dlf – Essay und Diskurs', 'https://www.deutschlandfunk.de/essay-und-diskurs-102.xml', 'deutschlandfunk.de'],
    ['Dlf – Tatort Kunst', 'https://www.deutschlandfunk.de/tatort-kunst-102.xml', 'deutschlandfunk.de'],
    ['Ohrenbär (Kinder)', 'https://www.ohrenbaer.de/podcast/podcast.xml/feed=podcast.xml', 'ohrenbaer.de'],
    ['Guardian – Today in Focus', 'https://www.theguardian.com/news/series/todayinfocus/rss', 'theguardian.com', 'rss', 'en']] },
  { gruppe: 'Sport', items: [
    ['Sportschau', 'https://www.sportschau.de/index~rss2.xml', 'sportschau.de'],
    ['Sportschau – Bundesliga', 'https://www.sportschau.de/fussball/bundesliga/index~rss2.xml', 'sportschau.de'],
    ['kicker', 'https://newsfeed.kicker.de/news/aktuell', 'kicker.de'],
    ['Bundesliga (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6UL29enLNe4mqwTfAyeNuw', 'youtube.com', 'youtube'],
    ['Sportschau (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCRFsyeKu07-LnHDG44O6uCA', 'youtube.com', 'youtube'],
    ['BBC Sport', 'https://feeds.bbci.co.uk/sport/rss.xml', 'bbc.co.uk', 'rss', 'en'],
    ['Sky Sports', 'https://www.skysports.com/rss/11661', 'skysports.com', 'rss', 'en'],
    ['The Guardian – Sport', 'https://www.theguardian.com/us/sport/rss', 'theguardian.com', 'rss', 'en'],
    ['RTÉ Sport', 'https://www.rte.ie/feeds/rss/?index=/sport/', 'rte.ie', 'rss', 'en']] },
  { gruppe: 'Kultur & Satire', items: [
    ['Deutschlandfunk – Kultur', 'https://www.deutschlandfunk.de/kulturportal-100.rss', 'deutschlandfunk.de'],
    ['extra 3 (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCjhkuC_Pi85wGjnB0I1ydxw', 'youtube.com', 'youtube'],
    ['The Onion', 'https://theonion.com/feed/', 'theonion.com', 'rss', 'en'],
    ['The Daily Mash', 'https://www.thedailymash.co.uk/feed', 'thedailymash.co.uk', 'rss', 'en'],
    ['The Shovel', 'https://theshovel.com.au/feed/', 'theshovel.com.au', 'rss', 'en']] },
  { gruppe: 'Lifestyle & Beauty', items: [
    ['Hella & Tom (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCeBKU-99g_weNNPpZ2YMvvQ', 'youtube.com', 'youtube'],
    ['BibisBeautyPalace (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHfdTAyg5t4mb1G-3rJ6QsQ', 'youtube.com', 'youtube'],
    ['Dagi Bee (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCpZ_DI-ZugwMzXcqccaTVsg', 'youtube.com', 'youtube'],
    ['GLAMOUR Germany (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC7Jcy9H1paeaC9bqN6uYcHw', 'youtube.com', 'youtube'],
    ['Vogue Germany', 'https://www.vogue.de/feed/rss', 'vogue.de'],
    ['GLAMOUR Germany', 'https://www.glamour.de/feed/rss', 'glamour.de'],
    ['BRIGITTE', 'https://www.brigitte.de/feed.rss', 'brigitte.de'],
    ['Lifehacker', 'https://lifehacker.com/feed/rss', 'lifehacker.com', 'rss', 'en'],
    ['BBC Good Food', 'https://www.bbcgoodfood.com/feed', 'bbcgoodfood.com', 'rss', 'en'],
    ['Apartment Therapy', 'https://www.apartmenttherapy.com/main.rss', 'apartmenttherapy.com', 'rss', 'en'],
    ['The Guardian – Life & Style', 'https://www.theguardian.com/us/lifeandstyle/rss', 'theguardian.com', 'rss', 'en']] },
  { gruppe: 'Tech & Netz', items: [
    ['heise online', 'https://www.heise.de/rss/heise-atom.xml', 'heise.de'],
    ['netzpolitik.org', 'https://netzpolitik.org/feed/', 'netzpolitik.org'],
    ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'arstechnica.com', 'rss', 'en'],
    ['Engadget', 'https://www.engadget.com/rss.xml', 'engadget.com', 'rss', 'en'],
    ['The Verge', 'https://www.theverge.com/rss/index.xml', 'theverge.com', 'rss', 'en'],
    ['TechCrunch', 'https://techcrunch.com/feed/', 'techcrunch.com', 'rss', 'en'],
    ['WIRED', 'https://www.wired.com/feed/rss', 'wired.com', 'rss', 'en'],
    ['Hacker News', 'https://news.ycombinator.com/rss', 'news.ycombinator.com', 'rss', 'en'],
    ['CORRECTIV', 'https://correctiv.org/feed/', 'correctiv.org'],
    ['ProPublica', 'https://www.propublica.org/feed', 'propublica.org', 'rss', 'en']] },
  { gruppe: 'Wirtschaft & Unternehmen', items: [
    ['Moneycab', 'https://www.moneycab.com/feed/', 'moneycab.com'],
    ['Volkswagen Group – Pressemitteilungen (Unternehmen)', 'https://www.volkswagen-group.com/de/feeds/pressemitteilungen', 'volkswagen-group.com'],
    ['Lufthansa Group – Newsroom (Unternehmen)', 'https://newsroom.lufthansagroup.com/feed/de', 'lufthansagroup.com'],
    ['Deutsche Bahn – Presseinformationen (Unternehmen)', 'https://www.deutschebahn.com/service/rss/de/6868410/feed.rss', 'deutschebahn.com'],
    ['Quartz', 'https://qz.com/rss', 'qz.com', 'rss', 'en']] },
  { gruppe: 'Wissen & Raumfahrt', items: [
    ['Spektrum der Wissenschaft', 'https://www.spektrum.de/alias/rss/spektrum-de-rss-feed/996406', 'spektrum.de'],
    ['ESA – Weltraumforschung', 'https://www.esa.int/rssfeed/Our_Activities/Space_Science', 'esa.int'],
    ['wissenschaft.de – Bild der Wissenschaft', 'https://wissenschaft.de/feed.xml', 'wissenschaft.de'],
    ['MAITHINK X – Mai Thi Nguyen-Kim (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCyHDQ5C6z1NDmJ4g6SerW8g', 'youtube.com', 'youtube'],
    ['Terra X Lesch & Co (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC5E9-r42JlymhLPnDv2wHuA', 'youtube.com', 'youtube'],
    ['ScienceDaily', 'https://www.sciencedaily.com/rss/top/science.xml', 'sciencedaily.com', 'rss', 'en'],
    ['Phys.org', 'https://phys.org/rss-feed/', 'phys.org', 'rss', 'en'],
    ['NASA', 'https://www.nasa.gov/feed/', 'nasa.gov', 'rss', 'en'],
    ['Space.com', 'https://www.space.com/feeds.xml', 'space.com', 'rss', 'en'],
    ['NASA (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCLA_DiR1FfKNvjuUpBHmylQ', 'youtube.com', 'youtube', 'en'],
    ['Raumfahrer.net', 'https://www.raumfahrer.net/feed/', 'raumfahrer.net'],
    ['Raketenstarts – Startplan (Launch Library 2)', 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10&mode=normal', 'thespacedevs.com'],  // #42: offene API, rss.php macht daraus einen Tageseintrag
    ['ESA – Space News', 'https://www.esa.int/rssfeed/Our_Activities/Space_News', 'esa.int', 'rss', 'en'],
    ['Wikipedia – Artikel des Tages', 'https://de.wikipedia.org/w/api.php?action=featuredfeed&feed=featured&feedformat=atom', 'de.wikipedia.org'],
    ['Wikipedia – Was geschah am …?', 'https://de.wikipedia.org/w/api.php?action=featuredfeed&feed=onthisday&feedformat=rss', 'de.wikipedia.org'],
    ['Wikipedia – Today\'s featured article', 'https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=featured&feedformat=atom', 'en.wikipedia.org', 'rss', 'en'],
    ['Wikipedia – On this day', 'https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=onthisday&feedformat=atom', 'en.wikipedia.org', 'rss', 'en'],
    ['GEO', 'https://www.geo.de/feed/rss/geo/', 'geo.de'],
    ['idw – Pressemitteilungen aus der Forschung', 'https://idw-online.de/de/pressreleasesrss', 'idw-online.de'],
    ['Uni Oldenburg – Nachrichten (Hochschule)', 'https://uol.de/aktuelles/rss', 'uol.de'],
    ['WHO – News (Institution)', 'https://www.who.int/rss-feeds/news-english.xml', 'who.int', 'rss', 'en']] },
  { gruppe: 'Dossier Ukraine', items: [
    ['Russland verstehen (LibMod)', 'https://russlandverstehen.eu/de/feed/', 'russlandverstehen.eu'],
    ['MDR – Was tun, Herr General?', 'https://www.mdr.de/nachrichten/podcast/general/russland-angriff-krieg-ukraine-mdr-100.xml', 'mdr.de'],
    ['The Kyiv Independent', 'https://kyivindependent.com/news-archive/rss/', 'kyivindependent.com', 'rss', 'en'],
    ['Ukrainska Pravda (EN)', 'https://www.pravda.com.ua/eng/rss', 'pravda.com.ua', 'rss', 'en'],
    ['Meduza', 'https://meduza.io/rss/all', 'meduza.io', 'rss', 'ru']] },
  // Regionalpaket Gifhorn (Issue #1): M017/M018, Prüfstand 21.10.2026 – nur Quellen mit Feed
  { gruppe: 'Regional: Gifhorn', items: [
    ['NDR Niedersachsen', 'https://www.ndr.de/nachrichten/niedersachsen/index~rss2.xml', 'ndr.de'],
    ['Aller-Zeitung – Gifhorn', 'https://www.az-online.de/isenhagener-land/gifhorn/rssfeed.rdf', 'az-online.de'],
    ['Braunschweiger Zeitung – Gifhorn', 'https://www.braunschweiger-zeitung.de/niedersachsen/gifhorn/rss', 'braunschweiger-zeitung.de'],
    ['Polizeiinspektion Gifhorn', 'https://www.presseportal.de/rss/dienststelle_56517.rss2', 'presseportal.de'],
    ['MTV Gifhorn', 'https://www.mtv-gifhorn.de/?format=feed&type=rss', 'mtv-gifhorn.de']] },
  // Umgebung Gifhorn (Issue #39): M022, Prüfstand 22.10.2026 6/8 – Braunschweiger Amtsblatt/Bekanntmachungen ohne Feed verworfen,
  // Polizei-Regionen Gifhorn/Meine doppeln die Polizeiinspektion Gifhorn oben. Nicht Teil des W0-Einstiegs (nur Gifhorn).
  { gruppe: 'Regional: Wolfsburg & Braunschweig', items: [
    ['WAZ Wolfsburger Allgemeine', 'https://www.waz-online.de/arc/outboundfeeds/rss/', 'waz-online.de'],
    ['Polizei Wolfsburg (Presseportal)', 'https://www.presseportal.de/rss/polizei/r/Wolfsburg.rss2', 'presseportal.de'],
    ['Polizei Braunschweig (Presseportal)', 'https://www.presseportal.de/rss/polizei/r/Braunschweig.rss2', 'presseportal.de'],
    ['VfL Wolfsburg', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCfdfDFNp50xLjAjD0TKOa4g', 'youtube.com', 'youtube']] },
  // Regionalpaket Borkum (Issue #13): M018 Abschnitt 10, Prüfstand 21.10.2026 – nur Quellen mit aktuellem Feed
  { gruppe: 'Regional: Borkum', items: [
    ['Borkum-News', 'https://www.borkum-news.de/feed/', 'borkum-news.de'],
    ['Nationalpark Wattenmeer', 'https://www.nationalpark-wattenmeer.de/feed/', 'nationalpark-wattenmeer.de'],
    ['Polizeiinspektion Leer/Emden', 'https://www.presseportal.de/rss/dienststelle_104235.rss2?langid=1', 'presseportal.de']] },
  { gruppe: 'YouTube', items: [
    ['MrWissen2go', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZHpIFMfoJJ_1QxNGLJTzyA', 'youtube.com', 'youtube'],
    ['Dinge Erklärt – Kurzgesagt', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCwRH985XgMYXQ6NxXDo8npw', 'youtube.com', 'youtube'],
    ['BBC News (YouTube)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC16niRr50-MSBwiO3YDb3RA', 'youtube.com', 'youtube', 'en'],
    ['Kurzgesagt – In a Nutshell', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q', 'youtube.com', 'youtube', 'en']] }
];
// Issue #45 (Modul yt-auswahl): YouTube als zwei Auswahlen – „KOMPASS-Empfehlungen“ (bisherige Kanäle, klar als unsere
// Empfehlung benannt) und „Top-YouTuber“ (reichweitenstärkste Kanäle, Prüfstand 22.10.2026, 12/12). Ausgeschaltet: wie bisher eine Gruppe „YouTube“.
if (modulAn('yt-auswahl')) {
  const i = CATALOG.findIndex((g) => g.gruppe === 'YouTube');
  if (i >= 0) {
    const g = CATALOG[i]; g.gruppe = 'YouTube: KOMPASS-Empfehlungen';
    g.items.splice(2, 0,
      ['Hella & Tom', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCeBKU-99g_weNNPpZ2YMvvQ', 'youtube.com', 'youtube'],
      ['Gamazda', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCKscaP2HvovgMjkpY6KwfJQ', 'youtube.com', 'youtube'],
      ['MAITHINK X – Mai Thi Nguyen-Kim', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCyHDQ5C6z1NDmJ4g6SerW8g', 'youtube.com', 'youtube'],
      ['Terra X Lesch & Co', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC5E9-r42JlymhLPnDv2wHuA', 'youtube.com', 'youtube'],
      ['extra 3', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCjhkuC_Pi85wGjnB0I1ydxw', 'youtube.com', 'youtube']);
    CATALOG.splice(i + 1, 0, { gruppe: 'YouTube: Top-YouTuber', alle: true, items: [  // alle: international, auch für deutsche Oberfläche
      ['Gronkh', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCYJ61XIK64sp6ZFFS8sctxw', 'youtube.com', 'youtube'],
      ['Simplicissimus', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCKGMHVipEvuZudhHD05FOYA', 'youtube.com', 'youtube'],
      ['MrBeast', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCX6OQ3DkcsbYNE6H8uQQuVA', 'youtube.com', 'youtube', 'en'],
      ['PewDiePie', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-lHJZR3Gqxm24_Vd_AJ5Yw', 'youtube.com', 'youtube', 'en'],
      ['Mark Rober', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCY1kMZp36IQSyNx_9h4mpCg', 'youtube.com', 'youtube', 'en'],
      ['Veritasium', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA', 'youtube.com', 'youtube', 'en'],
      ['Marques Brownlee', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ', 'youtube.com', 'youtube', 'en'],
      ['Dude Perfect', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCRijo3ddMTht_IHyNSNXpNQ', 'youtube.com', 'youtube', 'en'],
      ['Mrwhosetheboss', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCMiJRAwDNSNzuYeN2uWa0pA', 'youtube.com', 'youtube', 'en']] });
  }
}
// #20: PeerTube-Kanäle aus M008 (Prüfstand 10/10) als eigene Gruppe – Fediverse-Video ohne Plattform (Modul peertube)
if (modulAn('peertube')) CATALOG.push({ gruppe: 'PeerTube (Fediverse-Video)', items: [
    ['heise c’t 3003', 'https://peertube.heise.de/feeds/podcast/videos.xml?videoChannelId=4', 'peertube.heise.de'],
    ['heise c’t uplink', 'https://peertube.heise.de/feeds/podcast/videos.xml?videoChannelId=1129', 'peertube.heise.de'],
    ['heise show', 'https://peertube.heise.de/feeds/podcast/videos.xml?videoChannelId=1132', 'peertube.heise.de'],
    ['Digitalcourage – Medienecho', 'https://digitalcourage.video/feeds/podcast/videos.xml?videoChannelId=11', 'digitalcourage.video'],
    ['Digitalcourage – Freie Software und Bildung', 'https://digitalcourage.video/feeds/podcast/videos.xml?videoChannelId=1469', 'digitalcourage.video'],
    ['LfDI BW – Datenfreiheit', 'https://tube.xn--baw-joa.social/feeds/podcast/videos.xml?videoChannelId=23', 'tube.xn--baw-joa.social'],
    ['Zeitzeugeninterviews (LFB BW)', 'https://pt01.lehrerfortbildung-bw.de/feeds/podcast/videos.xml?videoChannelId=42', 'pt01.lehrerfortbildung-bw.de'],
    ['KH Berlin – Projekte Mode-Design', 'https://tube.kh-berlin.de/feeds/videos.xml?videoChannelName=projekte_modedesign', 'tube.kh-berlin.de'],
    ['KH Berlin – Videokunst', 'https://tube.kh-berlin.de/feeds/videos.xml?videoChannelName=vk_kanal', 'tube.kh-berlin.de'],
    ['Virtuelle PH', 'https://tube.virtuelle-ph.at/feeds/podcast/videos.xml?videoChannelId=2', 'tube.virtuelle-ph.at']] });
// Bluesky-Listen und -Starter-Packs (M009, nur „sicher“ markierte; Issue #16). Eigene Tabelle, nicht im Willkommen:
// die Adresse wird erst beim Hinzufügen zur at://-Adresse aufgelöst (quellen/laden.js bskyQuelleAufloesen). Modul bsky-quellen.
const KATALOG_BSKY = [
  ['Deutsche Medienlandschaft', 'https://bsky.app/starter-pack/hoppeditza.bsky.social/3lh2xqejfy62a', 'Nachrichten'],
  ['Deutschsprachige Medien', 'https://bsky.app/starter-pack/tibor.net/3lbdiinjnya2z', 'Nachrichten'],
  ['Journalisten', 'https://bsky.app/profile/tibor.net/lists/3kaphizvhza2u', 'Nachrichten'],
  ['Die Krautreporter-Redaktion', 'https://bsky.app/starter-pack/krautreporter.bsky.social/3lgamvtkp3a2q', 'Nachrichten'],
  ['Recherchekooperation NDR, WDR, SZ', 'https://bsky.app/starter-pack/did:plc:5zs2wvlkigmvgbqlwmmy5rml/3lbbxr4srav2a', 'Recherche'],
  ['Deutsche Bundesbehörden', 'https://bsky.app/starter-pack/behoerden.bsky.social/3lk6a4e6kb22j', 'Verwaltung'],
  ['Katastrophen- und Zivilschutz', 'https://bsky.app/profile/hoppeditza.bsky.social/lists/3lglxlvnpzo2q', 'Gesellschaft'],
  ['Grüne Unternehmen und NGOs', 'https://bsky.app/starter-pack/greenjobs.de/3lbztqm5nix2u', 'Klima & Umwelt'],
  ['Grüne Organisationen', 'https://bsky.app/profile/greenjobs.de/lists/3kdk7r34wf52v', 'Klima & Umwelt'],
  ['Momentum Institut (AT)', 'https://bsky.app/starter-pack/momentum-institut.at/3lmu46qbxje2c', 'Wirtschaft'],
  ['Österreichs Politik', 'https://bsky.app/profile/thomasmohr.bsky.social/lists/3lcdb3j5njb2c', 'Politik (AT)'],
  ['Politik in Bremen', 'https://bsky.app/starter-pack/abgeordnete.bsky.social/3lkkvn7chuv24', 'Politik (Bremen)']
];
// Sprache je Katalog-Quelle (5. Feld oder nach Domain, Standard de). Anzeige: zuerst die Quellen in der Sprache der Oberfläche
const KATALOG_SPRACHE = { 'bbc.co.uk': 'en', 'theguardian.com': 'en' };
function katalogSprache(item) { return item[4] || KATALOG_SPRACHE[item[2]] || 'de'; }
function katalogItems(g) { return g.items.slice().sort((a, b) => (katalogSprache(b) === LANG) - (katalogSprache(a) === LANG)); }
// Für ein angetipptes Thema: nur die Quellen in der eigenen Sprache, solange es welche gibt
function katalogFuerMich(g) { if (g.alle) return g.items; const eig = g.items.filter((x) => katalogSprache(x) === LANG); return eig.length ? eig : g.items; }
function hashId(s) { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); }
function shortTitle(t) { const s = String(t || '').trim(); if (s.length <= 32) return s; const k = s.split(/\s[-|–]\s/)[0]; return (k.length >= 3 ? k : s).slice(0, 60); }
const wideMQ = window.matchMedia('(min-width: 1024px)');
function isWide() { return wideMQ.matches; }

const settings = Object.assign({
  mastodon: '', bluesky: '',
  radar: { 'radar': false, 'radar-gifhorn': false, 'radar-borkum': false, 'radar-idstein': false },
  pauseAfter: 20, onboarded: false, feeds: [], aiWunsch: '', name: '', olAnhang: true
}, store.get('settings', {}));
if (!Array.isArray(settings.feeds)) settings.feeds = [];

const S = {
  mode: 'fav', countMode: 0, filter: null,
  posts: [], byId: {}, entries: {}, loading: false, errors: [],
  stack: [], pos: -1, dir: '', ended: false,
  favs: store.get('favs', {}),
  cfg: store.get('cfg', {}),
  seen: store.get('seen', {}),
  liked: store.get('liked', {}),
  marked: store.get('marked', {}),
  checks: store.get('checks', {}),
  history: store.get('history', []),
  cache: store.get('cache', {}),
  kfollows: store.get('kfollows', []),
  merges: store.get('merges', {}), alias: {}, suggest: [], raw: null, dupesAll: false,
  variantSel: {}, variantPref: store.get('variantPref', ''), fetched: {}, eq: '', playing: null, add: null,
  names: store.get('names', {}), nameDraft: null, mediaLookup: {}, expanded: {},
  ai: { on: store.get('aiOn', false), busy: false, err: '', res: store.get('aiRes', null), wunschOpen: false, wunschDraft: null }, aiWhy: {}, aiTheme: {},
  day: store.get('day', { d: today(), n: 0 }),
  total: store.get('total', 0),
  prevOpen: store.get('lastOpen', Date.now() - 86400000),
  nextPauseAt: null,
  overview: false, cfgKey: null, factOpen: false, chatOpen: false, msgs: [], draft: '',
  screen: settings.onboarded ? null : 'onboarding',
  q: '', onlyMarked: false, pause: false, pauseDone: false, toast: ''
};
if (S.day.d !== today()) S.day = { d: today(), n: 0 };
// „Gesehen“ wird unter einer kurzen Prüfnummer statt der langen Beitragsadresse geführt (kleiner, auch im Speicher-Abgleich)
const SK = new Map();
function sk(id) {
  let k = SK.get(id);
  if (!k) { const s = String(id); let a = 5381; let b = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = ((a * 33) ^ c) >>> 0; b = ((b * 31) + c) >>> 0; } k = a.toString(36) + b.toString(36).slice(-3); SK.set(id, k); }
  return k;
}
(() => {
  const old = Object.keys(S.seen).filter((k) => k.length > 12);
  if (!old.length) return;
  old.forEach((k) => { const t = S.seen[k]; delete S.seen[k]; const h = sk(k); if (!S.seen[h] || S.seen[h] > t) S.seen[h] = t; });
  store.set('seen', S.seen);
})();
S.nextPauseAt = S.day.n + (settings.pauseAfter || 0);
store.set('lastOpen', Date.now());

function save(...keys) {
  if (S.pruefDaten) return;  // #74: Beispieldaten der Vorschau – nichts speichern, nichts abgleichen
  for (const k of keys) store.set(k, k === 'settings' ? settings : S[k]);
  if (typeof noteChange === 'function') noteChange(keys);
}
function cfgOf(k) { return Object.assign({ show: true, count: true }, S.cfg[k] || {}); }
function cur() { return S.pos >= 0 ? (S.byId[S.stack[S.pos]] || S.cache[S.stack[S.pos]] || null) : null; }
