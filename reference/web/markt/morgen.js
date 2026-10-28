// Morgenformate in der Briefing Box (Issue #34, Modul morgenformate). Besitzer: Bau-Kern. Teil von KOMPASS (klassisches Skript).
// Die Box „Auf einen Blick“ zeigt unten „Zum Aufstehen“: je kurzem Nachrichtenformat der neueste Eintrag mit Titel, Zeit und
// Link bzw. ▶ Anhören. Keine Uhrzeit-Einstellung, kein Abo nötig – wer die App öffnet, sieht das Neueste (Pull statt Scroll).
// Feeds aus Mistral-Lieferung M028, im Prüfstand bestätigt; abgerufen über api/rss.php wie jede andere Quelle, einmal je Öffnen.
const MORGEN_FORMATE = [
  { id: 'tagesschau100', name: 'tagesschau in 100 Sekunden', url: 'https://www.tagesschau.de/tagesschau_in_100_sekunden/index~atom.xml', seite: 'https://www.tagesschau.de/tagesschau_in_100_sekunden/' },
  { id: 'dlf-nachrichten', name: 'Deutschlandfunk – Die Nachrichten', url: 'https://www.deutschlandfunk.de/nachrichten-108.xml', seite: 'https://www.deutschlandfunk.de/nachrichten-100.html' }
];
const MORGEN = { tag: '', laedt: false, neu: {} };
function morgenLaden() {
  if (MORGEN.laedt || MORGEN.tag === today() + ':' + new Date().getHours()) return;  // höchstens einmal je Stunde neu
  MORGEN.laedt = true;
  Promise.allSettled(MORGEN_FORMATE.map((f) => getJSON('api/rss.php?aktion=feed&url=' + encodeURIComponent(f.url)).then((d) => {
    const e = d && d.status === 'ok' ? (d.eintraege || []).filter((x) => x && (x.link || x.medien)).sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')))[0] : null;
    MORGEN.neu[f.id] = e ? { titel: String(e.titel || f.name).slice(0, 160), link: e.link || f.seite, datum: e.datum || '', audio: e.medien && e.medien.art === 'audio' ? e.medien.url : '' } : null;
  }))).finally(() => { MORGEN.laedt = false; MORGEN.tag = today() + ':' + new Date().getHours();
    const c = typeof cur === 'function' && cur(); if (c && c.service === 'markt') renderStage(false); else render(); });  // Karte steht schon: neu zeichnen
}
function morgenZeit(iso) {
  const d = new Date(iso); if (!iso || isNaN(d)) return '';
  const loc = LANG === 'de' ? 'de-DE' : 'en-GB';
  const uhr = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return d.toDateString() === new Date().toDateString() ? tt('heute, {uhr}').replace('{uhr}', uhr) : d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'numeric' }) + ', ' + uhr;
}
// Block für briefingKarte (markt.js); null, solange nichts da ist
function morgenBlock() {
  if (!modulAn('morgenformate')) return null;
  morgenLaden();
  const zeilen = MORGEN_FORMATE.map((f) => {
    const e = MORGEN.neu[f.id];
    if (e === undefined) return null;  // lädt noch
    return h('div', { class: 'morgen-zeile' },
      h('span', { class: 'markt-name' }, f.name),
      e ? h('a', Object.assign({ class: 'markt-link', href: e.link }, EXT), e.titel + ' ↗') : h('a', Object.assign({ class: 'markt-link', href: f.seite }, EXT), tt('Zur Sendung ↗')),
      e && e.audio ? h('a', Object.assign({ class: 'morgen-play', href: e.audio, 'aria-label': tt('Anhören: ') + f.name }, EXT), '▶ ' + tt('Anhören')) : null,
      h('span', { class: 'markt-notiz' }, e ? morgenZeit(e.datum) : tt('Gerade nicht erreichbar')));
  }).filter(Boolean);
  if (!zeilen.length) return null;
  return h('section', { class: 'morgen-formate', 'aria-label': tt('Zum Aufstehen') }, h('h3', { class: 'morgen-titel' }, tt('Zum Aufstehen')), ...zeilen);
}
