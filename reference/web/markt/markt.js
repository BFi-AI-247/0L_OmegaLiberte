// SPDX-License-Identifier: AGPL-3.0-only
// Markt am Morgen (Issue #24, Modul markt): einmal am Tag eine Karte vorne im Stapel – Pull, kein Ticker.
// Werte über api/markt.php (EZB-Referenzkurs Dollar/Euro mit Vortag). Heizöl: Deutschlandpreis folgt aus offizieller Quelle
// (Karte A021); der regionale Preis ist nur ein Link zum Portal – Portalpreise werden nicht ausgelesen (#24).
// Gestaltung angelehnt an die Box der Wiesenzeitung (radar724.de): Zeitungsbox mit Zeilen Wert · Pfeil · Veränderung · Stand.
const MARKT = { daten: null, laedt: false, post: null };
// Region: Link zum Heizölpreis (3.000 l) beim Portal, nur wenn die Wiesenzeitung Gifhorn eingeschaltet ist
const MARKT_REGIONEN = [{ radar: 'radar-gifhorn', name: 'Gifhorn', link: 'https://www.heizoelboerse.de/heizoelpreise/niedersachsen/38518-gifhorn/', portal: 'heizoelboerse.de' }];
function marktId() { return 'markt:' + today(); }
function marktLaden() {
  if (!modulAn('markt') || MARKT.laedt || (MARKT.daten && MARKT.daten.tag === today())) return;
  const art = briefingArt();
  if (art === 'aus') return;  // #51: Box abgewählt
  MARKT.laedt = true;
  const titel = art ? tt('Auf einen Blick') : tt('Markt am Morgen');
  const setzen = (d) => {
    MARKT.daten = Object.assign({ tag: today() }, d || {});
    MARKT.post = S.byId[marktId()] = { id: marktId(), service: 'markt', tags: [], who: titel, whoKey: 'markt', title: titel, text: '', date: new Date().toISOString(), media: [] };
    render();
  };
  getJSON('api/markt.php').then((d) => {
    if (d && d.status === 'ok' && d.dollar) setzen(d); else if (art) setzen(null);  // Briefing: Datum und Sonne gehen auch ohne Kurse
  }).catch(() => { if (art) setzen(null); }).finally(() => { MARKT.laedt = false; });
}
// Vorne in die chronologische Liste (ohne Quellen-Filter), bis die Karte heute gesehen wurde
function marktVorne(liste) {
  if (!modulAn('markt') || S.filter || !MARKT.daten || MARKT.daten.tag !== today() || !MARKT.post) return liste;
  S.byId[marktId()] = MARKT.post;  // build() baut S.byId neu – die Pseudo-Karte wieder eintragen
  return [MARKT.post].concat(liste);
}
function marktZahl(x, stellen) { return Number(x).toLocaleString(LANG === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }); }
function marktDatum(iso) { const d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString(LANG === 'de' ? 'de-DE' : 'en-US', { weekday: 'long', day: 'numeric', month: 'numeric' }); }
function marktZeile(name, wert, prozent, notiz) {
  const pf = prozent == null ? null : prozent > 0 ? ['▲', 'auf', tt('plus')] : prozent < 0 ? ['▼', 'ab', tt('minus')] : ['■', 'gleich', ''];
  return h('div', { class: 'markt-zeile' },
    h('span', { class: 'markt-name' }, name),
    h('span', { class: 'markt-wert' }, wert),
    pf ? h('span', { class: 'markt-pfeil ' + pf[1] }, pf[0] + ' ' + (pf[2] ? pf[2] + ' ' : '') + marktZahl(Math.abs(prozent), 1) + tt(' Prozent')) : h('span'),
    notiz ? h('span', { class: 'markt-notiz' }, notiz) : null);
}
// ---------- Briefing Box (#51, Modul briefing): „Auf einen Blick“ – Radar-Box (Frankfurt) oder Wiesenzeitung-Box (Gifhorn) ----------
// Schritt 1: „Heute ist …“ und Sonne rechnet das Gerät selbst (keine Quelle, kein Abruf), Dollar/Euro aus markt.php (EZB).
// Wetter (Bright Sky/DWD) folgt in Schritt 2, Kurse erst mit freier Quelle (Karten A021, A024), Namens-/Aktionstage (A023).
const BRIEFING_ORTE = { radar: { name: 'Frankfurt', lat: 50.110, lon: 8.682 }, wiesenzeitung: { name: 'Gifhorn', lat: 52.478, lon: 10.546 } };
function briefingArt() {
  if (!modulAn('briefing')) return null;
  const w = settings.briefing;
  if (w === 'aus' || w === 'radar' || w === 'wiesenzeitung') return w;
  return settings.einstieg === 'w0' || (settings.radar && settings.radar['radar-gifhorn']) ? 'wiesenzeitung' : 'aus';
}
function briefingWahl() {
  if (!modulAn('briefing')) return null;
  return h('div', { class: 'card-box' }, h('h3', {}, tt('Auf einen Blick (morgens vorne)')),
    einstWahl([['aus', tt('Aus')], ['radar', tt('Radar (Frankfurt)')], ['wiesenzeitung', tt('Wiesenzeitung (Gifhorn)')]], briefingArt(), (w) => {
      settings.briefing = w; save('settings'); MARKT.daten = null; MARKT.post = null; marktLaden(); render(true); }, 3));
}
// Sonnenauf- und -untergang (Sonnenaufgangsgleichung, Genauigkeit ~1–2 Minuten)
function briefingSonne(datum, lat, lon) {
  const rad = Math.PI / 180;
  const n = Math.round(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate(), 12) / 86400000 + 2440587.5 - 2451545.0);
  const js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * js) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const jt = 2451545 + js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const sd = Math.sin(L * rad) * Math.sin(23.4397 * rad); const cd = Math.cos(Math.asin(sd));
  const cw = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sd) / (Math.cos(lat * rad) * cd);
  if (cw < -1 || cw > 1) return null;
  const w = Math.acos(cw) / rad;
  const zeit = (j) => new Date((j - 2440587.5) * 86400000);
  return { auf: zeit(jt - w / 360), unter: zeit(jt + w / 360) };
}
function briefingUhr(d) { return d.toLocaleTimeString(LANG === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }); }
function briefingKw(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const tag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - tag); const j1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - j1) / 86400000 + 1) / 7);
}
function briefingHeute(d) {
  const tagImJahr = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1;
  const loc = LANG === 'de' ? 'de-DE' : 'en-GB';
  const teile = [tt('{n}. Tag des Jahres').replace('{n}', tagImJahr), tt('{n}. Kalenderwoche').replace('{n}', briefingKw(d))];
  // Zeitumstellung: letzter Sonntag im März bzw. Oktober – Hinweis in der Woche davor
  [[2, tt('beginnt die Sommerzeit')], [9, tt('endet die Sommerzeit')]].forEach(([monat, was]) => {
    const z = new Date(d.getFullYear(), monat + 1, 0); z.setDate(z.getDate() - z.getDay());
    const tage = Math.round((new Date(z.getFullYear(), z.getMonth(), z.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (tage >= 0 && tage <= 6) teile.push((tage === 0 ? tt('heute ') : tt('am Sonntag ({d}) ').replace('{d}', z.toLocaleDateString(loc, { day: 'numeric', month: 'numeric' }))) + was);
  });
  return { wert: d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }), notiz: teile.join(', ') + '.' };
}
// Heizöl: Deutschlandpreis aus dem EU Oil Bulletin (#51, Modul heizoel-de, M029) und der Link zum Preis in der Region
function heizoelZeilen(region, d) {
  const hz = modulAn('heizoel-de') && d && d.heizoel && d.heizoel.je100l ? d.heizoel : null;
  const link = h('a', Object.assign({ class: 'markt-link', href: region.link }, EXT), tt('Preis für {ort} (3.000 l) bei {portal} ansehen ↗').replace('{ort}', region.name).replace('{portal}', region.portal));
  if (!hz) return [h('div', { class: 'markt-zeile' }, h('span', { class: 'markt-name' }, tt('Heizöl')), link, h('span', { class: 'markt-notiz' }, tt('Deutschlandpreis aus amtlicher Quelle folgt.')))];
  const stand = hz.stand ? ', ' + tt('Stand ') + new Date(hz.stand + 'T12:00:00').toLocaleDateString(LANG === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'numeric' }) : '';
  return [marktZeile(tt('Heizöl'), marktZahl(hz.je100l, 2) + ' €', null, tt('je 100 Liter, Durchschnitt Deutschland (EU Oil Bulletin') + stand + ')'),
    h('div', { class: 'markt-zeile' }, h('span', { class: 'markt-name' }), link)];
}
// Namens- und Aktionstag als eigene Zeile (#51, Modul heute-tage) – nur auf Deutsch, die Liste ist deutschsprachig
function heuteTageZeile(d) {
  const t = LANG === 'de' && typeof heuteTage === 'function' ? heuteTage(d) : null;
  if (!t) return null;
  return t.namen ? marktZeile(tt('Namenstag'), t.namen, null, t.aktion || null) : marktZeile(tt('Aktionstag'), t.aktion, null, null);
}
function marktKarte(p) {
  if (!p || p.service !== 'markt') return null;
  const d = MARKT.daten; if (!d) return null;
  const art = briefingArt(); if (art && art !== 'aus') return briefingKarte(art, d);
  const usd = d.dollar;
  const region = MARKT_REGIONEN.find((r) => settings.radar && settings.radar[r.radar]);
  const zeilen = [marktZeile(tt('Dollar/Euro'), marktZahl(usd.kurs, 4), usd.prozent,
    tt('1 Euro = {k} US-Dollar (EZB-Referenzkurs {d})').replace('{k}', marktZahl(usd.kurs, 4)).replace('{d}', marktDatum(usd.datum)))];
  if (region) zeilen.push(...heizoelZeilen(region, d));
  return h('article', { class: 'card markt-karte', 'aria-label': tt('Markt am Morgen') },
    h('div', { class: 'card-body' },
      h('div', { class: 'markt-box' },
        h('h2', { class: 'markt-titel' }, tt('Markt am Morgen')),
        h('div', { class: 'markt-zeilen' }, ...zeilen),
        h('p', { class: 'markt-quellen' }, tt('Quellen: ') + tt('EZB (Dollar/Euro)') + (region && modulAn('heizoel-de') && d.heizoel ? ' · ' + tt('EU Oil Bulletin (Heizöl)') : '') + (region ? ' · ' + region.portal + tt(' (Heizöl, nur Link)') : '') + '. ' + tt('Einmal am Tag, kein Ticker.')))));
}
modusRegistrieren({ id: 'markt', label: tt('Markt am Morgen'), aktiv: () => false, karte: marktKarte });
function briefingKarte(art, d) {
  const ort = BRIEFING_ORTE[art]; const jetzt = new Date();
  const heute = briefingHeute(jetzt); const so = briefingSonne(jetzt, ort.lat, ort.lon);
  const zeilen = [marktZeile(tt('Heute ist …'), heute.wert, null, heute.notiz)];
  const tage = heuteTageZeile(jetzt); if (tage) zeilen.push(tage);
  if (so) zeilen.push(marktZeile(tt('Sonne'), '↑ ' + briefingUhr(so.auf) + '  ↓ ' + briefingUhr(so.unter), null, tt('Auf- und Untergang in {ort}').replace('{ort}', ort.name)));
  const usd = d.dollar;
  if (usd) zeilen.push(marktZeile(tt('Dollar/Euro'), marktZahl(usd.kurs, 4), usd.prozent,
    tt('1 Euro = {k} US-Dollar (EZB-Referenzkurs {d})').replace('{k}', marktZahl(usd.kurs, 4)).replace('{d}', marktDatum(usd.datum))));
  const region = art === 'wiesenzeitung' ? MARKT_REGIONEN[0] : null;
  if (region) zeilen.push(...heizoelZeilen(region, d));
  const quellen = [tt('Datum und Sonne: auf deinem Gerät berechnet')].concat(tage ? [tt('Namens- und Aktionstage: Wikipedia (CC BY-SA 4.0)')] : []).concat(usd ? [tt('EZB (Dollar/Euro)')] : [])
    .concat(region && modulAn('heizoel-de') && d && d.heizoel ? [tt('EU Oil Bulletin (Heizöl)')] : []).concat(region ? [region.portal + tt(' (Heizöl, nur Link)')] : []);
  return h('article', { class: 'card markt-karte briefing-' + art, 'aria-label': tt('Auf einen Blick') },
    h('div', { class: 'card-body' },
      h('div', { class: 'markt-box' },
        h('h2', { class: 'markt-titel' }, tt('Auf einen Blick')),
        h('div', { class: 'markt-zeilen' }, ...zeilen),
        typeof morgenBlock === 'function' ? morgenBlock() : null,  // #34
        h('p', { class: 'markt-quellen' }, tt('Stand ') + jetzt.toLocaleDateString(LANG === 'de' ? 'de-DE' : 'en-GB') + ' · ' + quellen.join(' · ') + '. ' + tt('Einmal am Tag, kein Ticker.')))));
}
