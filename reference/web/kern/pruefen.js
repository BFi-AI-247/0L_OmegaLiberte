// SPDX-License-Identifier: AGPL-3.0-only
// Vorschau – Prüfhilfen (Issue #74, Modul pruefhilfen). Nur in der Vorschau-Instanz (INSTANZ.speicher 'vorschau'), live nie sichtbar.
// Menü „Prüfen“ am Etikett „VORSCHAU“ oben: Beispieldaten laden (fester Testsatz ohne Netz), Zustände sofort zeigen,
// Version und Hinweis „neu laden“, wenn eine neuere Vorschau ausgeliefert wurde.
// Beispieldaten leben nur im Arbeitsspeicher: solange sie aktiv sind, speichert save() nichts und es wird nichts abgeglichen;
// „Zurück zu meinen Quellen“ lädt die Seite neu. Teil von KOMPASS (klassisches Skript, globaler Namensraum).
const PRUEF = { offen: false, neu: '', geprueft: 0 };
function pruefAn() { return INSTANZ.speicher === 'vorschau' && modulAn('pruefhilfen'); }
function pruefDatenAktiv() { return !!S.pruefDaten; }

// ---------- Beispieldaten ----------
const PRUEF_BILD = (farbe, text) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">'
  + '<rect width="800" height="450" fill="' + farbe + '"/><text x="400" y="240" font-family="sans-serif" font-size="44" fill="#fff" text-anchor="middle">' + text + '</text></svg>');
const PRUEF_QUELLEN = [
  ['bsp-nachrichten', 'Beispiel-Nachrichten', 'rss'], ['bsp-zeitung', 'Beispiel-Zeitung', 'rss'], ['bsp-radio', 'Beispiel-Radio', 'rss'],
  ['bsp-wissen', 'Beispiel-Wissen', 'rss'], ['bsp-blog', 'Beispiel-Blog', 'rss'], ['bsp-world', 'Example World News', 'rss'],
  ['bsp-monde', 'Exemple Monde', 'rss'], ['bsp-podcast', 'Beispiel-Podcast', 'rss'], ['bsp-katzen', '#caturday (mastodon.social)', 'rss'],
  ['bsp-video', 'Beispiel-Kanal', 'youtube'], ['bsp-kaputt', 'Beispiel (nicht erreichbar)', 'rss']
];
function pruefBeitraege() {
  const jetzt = Date.now(); const vor = (min) => new Date(jetzt - min * 60000).toISOString();
  const p = (q, n, min, felder) => Object.assign({ id: 'w:https://' + q + '.invalid/' + n, service: 'rss', tags: ['rss', 'f:' + q], who: (PRUEF_QUELLEN.find((x) => x[0] === q) || [])[1],
    whoKey: 'f:' + q, avatar: '', handle: q + '.invalid', link: 'https://' + q + '.invalid/' + n, date: vor(min), media: [], video: null, medien: null, thumb: '', card: null, urls: [] }, felder);
  // Eine Geschichte, fünf Berichte (#59: ‹ › in der KI-Auswahl, „+4 Berichte“)
  const mmx = [['bsp-nachrichten', 'Japanische Sonde MMX landet auf dem Marsmond Phobos', 'Die JAXA-Sonde MMX ist auf Phobos gelandet und soll Bodenproben zur Erde bringen.'],
    ['bsp-zeitung', 'Landung auf Phobos: JAXA-Mission MMX meldet Erfolg', 'Nach monatelangem Anflug setzte MMX sanft auf dem Marsmond Phobos auf, teilte die JAXA mit.'],
    ['bsp-radio', 'MMX auf Phobos – was die JAXA-Landung bedeutet', 'Die Sonde MMX soll auf Phobos Proben sammeln. Ein Gespräch über die Ziele der JAXA.'],
    ['bsp-wissen', 'Phobos-Proben: Wie MMX der JAXA den Ursprung der Marsmonde zeigen soll', 'Mit MMX will die JAXA klären, ob Phobos ein eingefangener Asteroid ist.'],
    ['bsp-blog', 'Live-Blog: MMX-Landung auf Phobos, JAXA bestätigt Kontakt', 'Alle Meldungen zur MMX-Landung auf Phobos in der Übersicht – die JAXA bestätigt Funkkontakt.']]
    .map(([q, t, x], i) => p(q, 'mmx', 20 + i * 7, { title: t, text: x, media: i === 0 ? [PRUEF_BILD('#2F6FB3', 'MMX · Phobos')] : [] }));
  const rest = [
    p('bsp-nachrichten', 'wetter', 50, { title: 'Herbststurm über Norddeutschland erwartet', text: 'Der Wetterdienst warnt für die Küste vor Böen bis 100 km/h.', media: [PRUEF_BILD('#4A5A6A', 'Sturm')] }),
    p('bsp-zeitung', 'lang', 65, { title: 'Ein sehr langer Titel, der zeigt, wie sich Überschriften mit vielen Wörtern in Kacheln, Karten und im Mosaik verhalten, ohne Wörter zu zerreißen', text: 'Prüft Zeilenumbrüche (#61).' }),
    p('bsp-world', 'en', 80, { title: 'City council approves new bike lanes', text: 'The council voted 7 to 2 for a network of protected bike lanes downtown.' }),
    p('bsp-monde', 'fr', 95, { title: 'Le musée rouvre après deux ans de travaux', text: 'Les visiteurs découvrent une nouvelle aile consacrée à l’art contemporain.' }),
    p('bsp-podcast', 'folge', 110, { title: 'Folge 42: Warum Herbstlaub bunt wird', text: 'Eine Viertelstunde über Chlorophyll und Carotinoide.', medien: { url: 'https://bsp-podcast.invalid/folge42.mp3', art: 'audio', typ: 'audio/mpeg' } }),
    p('bsp-katzen', 'katze1', 125, { title: '', text: 'Sonntagskatze #caturday', media: [PRUEF_BILD('#C0563B', 'Katze 1')] }),
    p('bsp-katzen', 'katze2', 140, { title: '', text: 'Noch eine #caturday', media: [PRUEF_BILD('#7B5CC4', 'Katze 2')] }),
    p('bsp-katzen', 'text', 150, { title: '', text: 'Nur Text, kein Bild – dieser Beitrag fehlt bei „Nur Bilder und Videos“ (#68).' }),
    Object.assign(p('bsp-video', 'video', 160, { title: 'Beispiel-Video: Ein Tag im Observatorium', text: '' }), { id: 'y:bsp-video-1', service: 'youtube', tags: ['youtube', 'f:bsp-video'], video: 'aqz-KE-bpKQ', thumb: PRUEF_BILD('#B22222', '▶ Video') }),
    p('bsp-blog', 'ohnebild', 175, { title: 'Kurznotiz ohne Bild', text: 'Ein einfacher Textbeitrag.' })
  ];
  for (let i = 0; i < 12; i++) rest.push(p(i % 2 ? 'bsp-nachrichten' : 'bsp-zeitung', 'meldung' + i, 190 + i * 15, { title: 'Meldung ' + (i + 1) + ' aus dem Beispielsatz', text: 'Füllbeitrag, damit Pause-Fenster und Zähler erreichbar sind.' }));
  return { mmx, alle: mmx.concat(rest) };
}
function pruefDatenBauen() {
  const base = {};
  PRUEF_QUELLEN.forEach(([id, title, kind]) => { base['f:' + id] = feedEntry({ id, url: 'https://' + id + '.invalid/feed.xml', title, kind, icon: '', site: '' }); });
  base.rss = { key: 'rss', name: tt('Websites & RSS'), type: 'dienst', service: 'rss', sub: tt('Dienst · ') + 'Beispiel' };
  const b = pruefBeitraege();
  S.raw = { base, people: [], posts: S.pruefDaten === 'leer' ? [] : b.alle };
  S.errors = S.pruefDaten === 'leer' ? [] : ['Beispiel (nicht erreichbar): ' + tt('Feed nicht lesbar')];
  S.seen = {}; S.day = { d: today(), n: 0 }; S.nextPauseAt = settings.pauseAfter || 0;
  build();
  // KI-Auswahl aus dem Beispielsatz (ohne Anfrage an eine KI): zwei Themen, die Geschichte mit fünf Berichten vorn
  const ids = b.alle.map((x) => x.id);
  S.ai.res = S.pruefDaten === 'leer' ? null : { at: Date.now(), ueberschrift: 'Beispiel-Auswahl', n: ids.length, quellen: PRUEF_QUELLEN.length, von: 'Beispieldaten', hinweis: '',
    lage: [{ thema: 'Landung auf Phobos', satz: 'Fünf Quellen berichten über die MMX-Landung.', ids: b.mmx.map((x) => x.id) },
      { thema: 'Stadt und Wetter', satz: 'Sturmwarnung, Radwege, Museum.', ids: ids.slice(5, 9) }],
    auswahl: [{ id: b.mmx[0].id, warum: 'Beispiel: eine Geschichte, mehrere Berichte', auch: b.mmx.slice(1).map((x) => x.id) }].concat(ids.slice(5, 9).map((id) => ({ id, warum: 'Beispiel' }))) };
  if (S.ai.res) aiPrepare();
  S.loading = false; S.stack = []; S.pos = -1; S.ended = false; S.filter = null;
  if (S.ai.on && S.ai.res) { show(lageId(), 'up'); return; }
  if (S.raw.posts.length) next(true); else render(true);
}
function pruefDatenLaden(art) {
  S.pruefDaten = art || 'beispiel'; PRUEF.offen = false;
  if (typeof startseiteSchliessen === 'function') startseiteSchliessen();
  S.screen = null; S.form = null; S.pause = false; S.overview = false;
  pruefDatenBauen();
  flash(art === 'leer' ? tt('Prüfen: leere Quellenliste (nichts gespeichert)') : tt('Beispieldaten geladen – nichts wird gespeichert oder abgeglichen.'));
}
function pruefZurueck() { S.pruefDaten = null; location.reload(); }

// ---------- Zustände sofort zeigen ----------
function pruefZustand(art) {
  PRUEF.offen = false;
  if (typeof startseiteSchliessen === 'function' && art !== 'start') startseiteSchliessen();
  S.screen = null; S.pause = false; S.overview = false;
  if (art === 'pause') { S.pause = true; S.pauseDone = false; render(); }
  else if (art === 'willkommen') { S.screen = 'onboarding'; S.form = null; render(); }
  else if (art === 'start') { if (STARTSEITE.el) STARTSEITE.el.remove(); STARTSEITE.el = null; STARTSEITE.zu = false; startseiteOeffnen(); }
  else if (art === 'durch') { S.ended = true; S.dir = 'up'; render(true); }
  else if (art === 'leer') pruefDatenLaden('leer');
  else if (art === 'einladung') { render(); flash(tt('Einladung übernommen – die KI-Funktionen sind auf diesem Gerät frei.')); }
}

// ---------- Version ----------
async function pruefVersion() {
  if (Date.now() - PRUEF.geprueft < 60000) return; PRUEF.geprueft = Date.now();
  try {
    const t = await (await fetch('kern/basis.js?v=' + Date.now(), { cache: 'no-store' })).text();
    const m = /const VERSION = '(v[\d.]+)'/.exec(t); PRUEF.neu = m && m[1] !== VERSION ? m[1] : '';
    pruefZeichnen();
  } catch (e) { /* offline – egal */ }
}

// ---------- Menü am Etikett „VORSCHAU“ (wird von render() aufgerufen) ----------
function pruefZeichnen() {
  let el = document.getElementById('vorschau-pruefen');
  document.documentElement.classList.toggle('mit-pruefen', pruefAn());
  if (!pruefAn()) { if (el) el.remove(); return; }
  if (!el) { el = h('div', { id: 'vorschau-pruefen', class: 'pruefen' }); document.body.append(el); pruefVersion(); }
  const knopf = h('button', { type: 'button', class: 'pruefen-knopf', 'aria-expanded': PRUEF.offen ? 'true' : 'false', 'aria-label': tt('Vorschau – Prüfhilfen'),
    onClick: () => { PRUEF.offen = !PRUEF.offen; if (PRUEF.offen) pruefVersion(); pruefZeichnen(); } },
    tt('VORSCHAU') + ' ' + VERSION + (S.pruefDaten ? ' · ' + tt('Beispiel') : '') + ' · ' + tt('Prüfen') + (PRUEF.offen ? ' ▴' : ' ▾'));
  const zustand = (art, text) => h('button', { type: 'button', class: 'mini', onClick: () => pruefZustand(art) }, text);
  const menue = PRUEF.offen ? h('div', { class: 'pruefen-menue', role: 'group', 'aria-label': tt('Prüfhilfen') },
    PRUEF.neu ? h('div', { class: 'pruefen-neu' }, tt('Neue Vorschau {v} ist da.').replace('{v}', PRUEF.neu), ' ',
      h('button', { type: 'button', class: 'mini primary', onClick: () => location.reload() }, tt('Neu laden'))) : null,
    h('div', { class: 'pruefen-titel' }, tt('Daten')),
    S.pruefDaten ? h('button', { type: 'button', class: 'mini primary', onClick: pruefZurueck }, tt('Zurück zu meinen Quellen'))
      : h('button', { type: 'button', class: 'mini primary', onClick: () => pruefDatenLaden('beispiel') }, tt('Beispieldaten laden')),
    h('div', { class: 'pruefen-titel' }, tt('Zustand jetzt zeigen')),
    h('div', { class: 'pruefen-reihe' },
      zustand('pause', tt('Pause-Fenster')), zustand('willkommen', tt('Willkommen')), modulAn('startseite') ? zustand('start', tt('Startseite')) : null,
      zustand('leer', tt('Leere Quellen')), zustand('durch', tt('Alles gesehen')),
      typeof einladungAusAdresse === 'function' ? zustand('einladung', tt('Einladung angenommen')) : null),
    h('div', { class: 'small pruefen-hinweis' }, tt('Nur in der Vorschau. Beispieldaten werden nicht gespeichert; „Zurück“ lädt neu.'))) : null;
  el.replaceChildren(knopf, ...(menue ? [menue] : []));
}
