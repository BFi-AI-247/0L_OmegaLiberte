// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Modus-Schnittstelle. Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.
//
// Ein Modus ist eine Sicht auf dieselben Daten (S.posts, S.entries). Er meldet sich mit modusRegistrieren({…}) an:
//   id            'social' | 'ki' | …
//   label         Anzeigename
//   aktiv()       true, wenn dieser Modus gerade die Bühne bekommt (Social ist der Rückfall)
//   reihenfolge(basis)   optional: aus den chronologisch sichtbaren Beiträgen die eigene Liste machen (Navigation weiter/zurück)
//   buehne(el, animate)  optional: zeichnet die Mitte komplett selbst. Ohne → Bühne des Social-Modus (Karten)
//   karte(p)      optional: eigene Karte für eigene Pseudo-Beiträge (z. B. service 'ki')
//   kartenZusatz(p, ort) optional: Zusatz an fremden Karten, ort = 'oben' | 'fuss' → Element oder null
//   verlassen()   optional: aufräumen, wenn ein anderer Modus die Bühne übernimmt
// Gerüst (ab v0.20, nur Laptop; Wert oder Funktion ohne Argumente):
//   seitenspalte  false → linke Spalte (Quellen) wird nicht gezeichnet und fällt aus dem Raster
//   rechts        { breite: 440, offen: true } → rechte Spalte fest breit und dauerhaft offen (kein Balken, kein Aufklappen)
//   gesten        false → Mausrad, Ziehen/Wischen und ↑ ↓ j k Leertaste rufen nicht weiter/zurück
// Eingaben:
//   taste(e)      wird vor der Kern-Tastatur gefragt; true = erledigt (Kern tut nichts mehr)
// Dialog:
//   chatBezug()   → { art: 'beitrag'|'thema'|'lage', titel, text, quelle } – Gegenstand für Dialog und Faktencheck rechts
// Am Element .app steht data-modus="<id des zeichnenden Modus>"; die Klasse ai-mode bedeutet weiterhin „KI-Auswahl eingeschaltet“.
const MODI = {};
function modusRegistrieren(def) { if (def.id !== 'social' && !modulAn(def.id)) return; MODI[def.id] = def; }
function aktiverModus() {
  for (const id of Object.keys(MODI)) { const m = MODI[id]; if (id !== 'social' && m.aktiv && m.aktiv()) return m; }
  return MODI.social;
}
// Karte für einen Beitrag – eigene Karten eines Modus haben Vorrang
function karteFuer(p) {
  for (const m of Object.values(MODI)) { const k = m.karte && m.karte(p); if (k) return k; }
  return cardFor(p);
}
// Zusätze anderer Modi an Karten (z. B. KI-Begründung oben, „Auch berichtet von“ im Fuß)
function kartenZusatz(p, ort) {
  return Object.values(MODI).map((m) => (m.kartenZusatz ? m.kartenZusatz(p, ort) : null)).filter(Boolean);
}
// Bühne: der aktive Modus zeichnet; beim Moduswechsel wird die Mitte geleert
let buehneVon = '';
function renderStage(animate) {
  const m = aktiverModus();
  const stage = els.stage;
  if (buehneVon && buehneVon !== m.id) {
    const alt = MODI[buehneVon]; if (alt && alt.verlassen) alt.verlassen();
    stage.textContent = ''; animate = false;
  }
  buehneVon = m.id;
  stage.dataset.modus = m.id;
  (m.buehne || MODI.social.buehne)(stage, animate);
}

// Wert eines Modus-Feldes – fester Wert oder Funktion
function modusWert(m, feld) { const v = m && m[feld]; return typeof v === 'function' ? v() : v; }
// Was der Kern beim Zeichnen des Gerüsts vom aktiven Modus wissen muss
function modusGeruest() {
  const m = aktiverModus() || {};
  const rechts = modusWert(m, 'rechts');
  return { id: m.id || 'social', seite: modusWert(m, 'seitenspalte') !== false, rechts: rechts && typeof rechts === 'object' ? rechts : null, gesten: modusWert(m, 'gesten') !== false };
}
// Gegenstand des Dialogs rechts (null = der aktuelle Beitrag wie bisher)
function modusChatBezug() { const m = aktiverModus(); return (m && typeof m.chatBezug === 'function' && m.chatBezug()) || null; }

// Modus-Leiste: ✦ KI-Auswahl · ☰ Chronologisch · ✎ Schreiben (Reihenfolge fest). Ersetzt den ✦-Schalter im Handy-Kopf,
// in der Laptop-Seitenspalte und in der KI-Kopfzeile. Handy-Kopf (wide=false): nur ✦ und ✎ als An/Aus-Schalter. Schreiben ohne verbundenen Dienst: ausgegraut, Druck → Konten.
function modusAktuell() { return S.schreiben && typeof postenVerbunden === 'function' && postenVerbunden() ? 'schreiben' : S.ai.on ? 'ki' : 'chrono'; }
function modusWahl(ziel) {
  const jetzt = modusAktuell(); if (ziel === jetzt) return;
  if (ziel === 'schreiben' && !postenVerbunden()) {
    flash(tt('Zum Schreiben verbinde zuerst Mastodon oder Bluesky.'));
    S.screen = 'settings'; S.einstReiter = 'konten'; S.form = null; S.overview = false; render(); return;
  }
  if (ziel === 'ki' && !KI.bereit() && !kiProbeErlaubt() && !S.pruefDaten) { flash(KI_OHNE()); S.screen = 'settings'; S.einstReiter = 'ki'; S.form = null; S.overview = false; render(); return; }
  if (ziel === 'ki') { S.schreiben = false; setAiMode(true); return; }
  if (ziel === 'chrono') { const warSchreiben = S.schreiben; S.schreiben = false; if (S.ai.on) setAiMode(false); else if (warSchreiben) render(true); return; }
  // Schreiben: KI still aus, Bühne übernimmt
  if (S.ai.on) { S.ai.on = false; store.set('aiOn', false); kibStapelOhneKi(); }
  S.schreiben = true; S.filter = null; S.overview = false; render(true);
}
function modusLeiste(wide) {
  const a = modusAktuell(); const kannSchreiben = typeof postenVerbunden === 'function' && postenVerbunden();
  const aus = (id) => (id === 'schreiben' && !kannSchreiben) || (id === 'ki' && !KI.bereit() && !kiProbeErlaubt() && !S.pruefDaten);  // #5: ✦ ohne eigene KI ausgegraut
  const knopf = (id, sym, label) => h('button', { type: 'button', class: 'modus-knopf' + (aus(id) ? ' aus' : ''), 'data-modus': id,
    'aria-pressed': a === id ? 'true' : 'false', title: label + (id === 'schreiben' && !kannSchreiben ? tt(' – erst Mastodon oder Bluesky verbinden') : ''), 'aria-label': label, onClick: () => modusWahl(id) },
    sym, wide ? h('span', { class: 'modus-text' }, label) : null);
  if (!wide) {
    // Handy-Kopf (Issue #2): nur Schalter – ✦ KI an/aus, ✎ Schreiben an/aus; ohne beides = Chronologisch. Kein ☰, damit der Quellen-Auswähler Platz hat.
    const schalter = (id, sym, label) => h('button', { type: 'button', class: 'modus-knopf' + (aus(id) ? ' aus' : ''), 'data-modus': id,
      'aria-pressed': a === id ? 'true' : 'false', title: label + (id === 'schreiben' && !kannSchreiben ? tt(' – erst Mastodon oder Bluesky verbinden') : ''), 'aria-label': label,
      onClick: () => modusWahl(a === id ? 'chrono' : id) }, sym);
    return h('div', { class: 'modus-leiste kompakt', role: 'group', 'aria-label': tt('Ansicht') },
      MODI.ki ? schalter('ki', h('span', { class: 'ai-spark', 'aria-hidden': 'true' }, '✦'), tt('KI-Auswahl an/aus')) : null,
      MODI.schreiben && modulAn('posten') ? schalter('schreiben', icon('stift', { sm: true }), tt('Schreiben an/aus')) : null);
  }
  return h('div', { class: 'modus-leiste' + (wide ? ' wide' : ''), role: 'group', 'aria-label': tt('Ansicht') },
    MODI.ki ? knopf('ki', h('span', { class: 'ai-spark', 'aria-hidden': 'true' }, '✦'), tt('KI-Auswahl')) : null,
    knopf('chrono', icon('liste', { sm: true }), tt('Chronologisch')),
    MODI.schreiben && modulAn('posten') ? knopf('schreiben', icon('stift', { sm: true }), tt('Schreiben')) : null);
}
