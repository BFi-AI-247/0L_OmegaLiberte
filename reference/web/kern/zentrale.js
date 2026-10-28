// Kern – Name der Zentrale (aus der Instanz-Konfiguration) und freiwilliger Installations-Ping ins Zero Ledger. Nach basis.js geladen.
// Name: kommt nur aus INSTANZ (instanz.js, Betreiber); Nutzer wählen ihn nicht (#8). Ein früher gesetztes settings.name wird still ignoriert.
// Ping: nur nach Einwilligung; Zustand nur auf diesem Gerät (store 'ping', nicht im Abgleich – eine Installation, nicht eine Person).
const PING_INTERVALL = 7 * 86400000;

// Kopf, Seitenspalte, KI-Bühne: Marke der Instanz
function zentraleMarke() { return INSTANZ.marke; }
// Willkommen, Tab-Titel: Name der Instanz
function zentraleName() { return INSTANZ.name; }
// Versionszeile in den Einstellungen
function zentraleVersion() { return INSTANZ.name + ' · ' + VERSION; }
// Tab-Titel steht in index.html; ein früher gesetzter eigener Titel (iPhone-Startbildschirm) wird entfernt
function zentraleTitel() { const m0 = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (m0) m0.remove(); }

// ---------- Zero Ledger ----------
function pingMoeglich() { return !!INSTANZ.ping; }
// #73: Die Vorschau-Instanz hat kein Ping-Ziel (der Deploy setzt INSTANZ.ping = ''). Damit Angebot und Schalter dort trotzdem
// geprüft werden können, zeigt sie beides als Probe: Zustimmung wird nur auf diesem Gerät vermerkt, gesendet wird nichts.
function pingProbe() { return !INSTANZ.ping && INSTANZ.speicher === 'vorschau'; }
function pingAnzeigen() { return pingMoeglich() || pingProbe(); }
function pingZiel() { return INSTANZ.ping ? hostOf(INSTANZ.ping) : 'omegaliberte.eu'; }
function pingProbeHinweis() { return pingProbe() ? h('div', { class: 'small ping-probe' }, tt('Vorschau: Hier wird nichts gesendet – Zustimmung und Abschalten wirken nur zum Ausprobieren.')) : null; }
function pingZustand() { return store.get('ping', null); }
function pingAn() { const z = pingZustand(); return !!(z && z.an); }
function pingId() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24); }
function pingInstanz() { return (location.host + location.pathname.replace(/\/[^/]*$/, '')).toLowerCase().slice(0, 100); }
async function pingSenden() {
  const z = pingZustand(); if (!z || !z.an || !pingMoeglich()) return false;
  const art = z.offen || 'lebt';
  try {
    const r = await fetch(INSTANZ.ping, { method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ id: z.id, art, version: VERSION, sprache: LANG, instanz: pingInstanz() }, await nutzerFeld())) });
    if (!r.ok) return false;
    const neu = pingZustand(); if (!neu || !neu.an || neu.id !== z.id) return false;  // inzwischen widerrufen
    delete neu.offen; neu.letzt = Date.now(); store.set('ping', neu);
    return true;
  } catch (e) { return false; }
}
// Einwilligung: art „neu“ oder „bestehend“ (es gab schon Verlauf), genau ein Ping jetzt
function pingEinwilligen() {
  if (!pingAnzeigen()) return;
  const bestehend = (S.history && S.history.length > 0) || (S.total || 0) > 0;
  store.set('ping', { an: true, id: pingId(), seit: Date.now(), letzt: 0, offen: bestehend ? 'bestehend' : 'neu' });
  pingSenden();
}
// Widerruf: keine Pings mehr, Nummer auf dem Gerät gelöscht
function pingWiderrufen() { store.set('ping', { an: false }); }
// Beim Öffnen: ausstehenden ersten Ping nachholen, sonst höchstens wöchentlich „lebt“
function pingBeimStart() {
  const z = pingZustand(); if (!z || !z.an || !pingMoeglich()) return;
  if (z.offen || Date.now() - (z.letzt || 0) >= PING_INTERVALL) pingSenden();
}

// #52 (Modul nutzer-ping): Nutzer zählen statt Geräte. Eine zufällige Nutzer-Kennung liegt in den Einstellungen (reist mit dem Abgleich);
// der Ping schickt nur einen Hash aus Kennung + 7-Tage-Fenster (wechselt alle 7 Tage, rollierend, nicht an der Kalenderwoche).
function nutzerKennungNeu() { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); }
function nutzerFenster(ms) { return Math.floor((ms || Date.now()) / (7 * 86400000)); }
async function nutzerFeld() {
  if (!modulAn('nutzer-ping') || !settings.nutzerKennung) return {};
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(settings.nutzerKennung + ':' + nutzerFenster()));
    return { nutzer: Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32) };
  } catch (e) { return {}; }
}
function nutzerKennungSetzen(wert) { settings.nutzerKennung = wert; save('settings'); render(); }
// Kleine Zeile unter dem Ping-Kästchen: Kennung ansehen, neu würfeln, entfernen – kein eigener Bereich
function nutzerKennungZeile() {
  if (!modulAn('nutzer-ping') || !pingAn()) return null;
  const k = settings.nutzerKennung;
  return h('div', { class: 'small nutzer-kennung' },
    k ? [tt('Nutzer-Kennung: '), h('code', {}, k.slice(0, 8) + '…'), ' ', tt('(im Ping nur als Code, der alle 7 Tage wechselt – zeigt nur, ob deine Geräte zusammengehören)'), ' ',
      h('button', { type: 'button', class: 'linkish', onClick: () => nutzerKennungSetzen(nutzerKennungNeu()) }, tt('neu würfeln')), ' · ',
      h('button', { type: 'button', class: 'linkish', onClick: () => nutzerKennungSetzen('') }, tt('entfernen'))]
      : [tt('Ohne Nutzer-Kennung wird je Gerät gezählt. '), h('button', { type: 'button', class: 'linkish', onClick: () => nutzerKennungSetzen(nutzerKennungNeu()) }, tt('Kennung anlegen'))]);
}
// Einmaliges Angebot im „Mach eine Pause“-Fenster (nur ohne Entscheidung zum Ping und mit Ping-Ziel der Instanz)
function pingPauseAngebot() {
  if (!modulAn('nutzer-ping') || !pingAnzeigen() || pingAn() || store.get('pingPauseNein', false) || store.get('ping', null)) return null;
  // #52 (22.10.): gleicher Text und gleicher Zustand wie in Einstellungen → Allgemein
  return h('div', { class: 'ping-pause small' },
    h('span', {}, tt('Darf OmegaLiberte mitzählen, dass es dich gibt? Nur eine Zufallsnummer, höchstens einmal pro Woche – keine Quellen, Konten oder Verläufe.')),  // #52 (23.10.): kurz – Einzelheiten unter Einstellungen → Allgemein „Was genau?“
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'mini primary', onClick: () => { if (!settings.nutzerKennung) { settings.nutzerKennung = nutzerKennungNeu(); save('settings'); } pingEinwilligen(); flash(tt('Danke! Deine Installation wird gezählt. Widerruf jederzeit über das Kästchen.')); render(); } }, tt('Ja, zählen')),
      h('button', { type: 'button', class: 'mini', onClick: () => { store.set('pingPauseNein', true); render(); } }, tt('Nein danke'))),
    pingProbeHinweis());
}

// Bausteine für Einstellungen und Willkommen
function zentralePingBox(f) {
  if (!pingAnzeigen()) return null;
  const mehr = h('details', { class: 'small ping-mehr' }, h('summary', {}, tt('Was genau?')),
    h('p', { style: 'margin:6px 0 0;line-height:1.5' }, tt('Gesendet: eine zufällige, auf dem Gerät erzeugte Installations-Nummer, die nichts über dich verrät; die Art („neu“, „bestehend“, „lebt“); App-Version und Sprache; die Instanz-Adresse (nicht deine). Wann: einmal bei Zustimmung, danach höchstens wöchentlich beim Öffnen. Wohin: Zero Ledger auf {ziel}. Nicht gesendet: Quellen, Konten, Zentralen-Name, Verlauf, Likes, Schlüssel. Die IP wird nicht gespeichert, nur 2 Stunden als Prüfsumme gegen Missbrauch. Gespeichert je Nummer: erste Art, erstes/letztes Datum, Version, Sprache, Instanz-Adresse. Widerruf jederzeit über das Kästchen – die Nummer wird auf dem Gerät gelöscht. Öffentlich sind nur Summen.').replace('{ziel}', pingZiel())));
  const box = h('input', { type: 'checkbox', id: 'k-ping', onChange: (e) => { f.ping = e.target.checked; } });
  box.checked = !!f.ping;
  return h('div', { class: 'card-box' }, h('h3', {}, tt('Mitzählen (freiwillig)')),
    h('label', { class: 'ping-zeile', for: 'k-ping' }, box,
      h('span', { class: 'small', style: 'line-height:1.5' }, tt('Darf OmegaLiberte mitzählen, dass es dich gibt? Nur eine Zufallsnummer, höchstens einmal pro Woche – keine Quellen, Konten oder Verläufe.'))),
    nutzerKennungZeile(), pingProbeHinweis(), mehr);
}
// Nach „Speichern“ / „Los geht’s“: Einwilligung umsetzen
function zentralePingUebernehmen(f) {
  if (!pingAnzeigen()) return;
  if (f.ping && !pingAn()) { if (modulAn('nutzer-ping') && !settings.nutzerKennung) { settings.nutzerKennung = nutzerKennungNeu(); save('settings'); } pingEinwilligen(); flash(tt('Danke! Deine Installation wird gezählt. Widerruf jederzeit über das Kästchen.')); }
  else if (!f.ping && pingAn()) { pingWiderrufen(); flash(tt('Alles klar. Es wird nichts mehr gesendet; die Nummer wurde auf deinem Gerät gelöscht.')); }
}

// Darstellung: settings.thema 'system' | 'hell' | 'dunkel'. Schaltet die Media-Regeln „prefers-color-scheme: dark“ der eigenen
// Stylesheets um (dunkel = immer, hell = nie, system = wie gehabt) – keine doppelten Farbtabellen nötig.
const THEMA_MEDIA = 'prefers-color-scheme: dark';
function zentraleThema() {
  const t = settings.thema === 'hell' || settings.thema === 'dunkel' ? settings.thema : 'system';
  for (const sh of document.styleSheets) {
    let regeln; try { regeln = sh.cssRules; } catch (e) { continue; }
    for (const r of regeln) {
      if (!(r instanceof CSSMediaRule)) continue;
      if (r._olMedia == null) { if (!r.media.mediaText.includes(THEMA_MEDIA)) continue; r._olMedia = r.media.mediaText; }
      const ziel = t === 'dunkel' ? 'all' : t === 'hell' ? 'not all' : r._olMedia;
      if (r.media.mediaText !== ziel) r.media.mediaText = ziel;
    }
  }
  document.documentElement.dataset.thema = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (m._olMedia == null) m._olMedia = m.getAttribute('media') || '';
    const dunkel = /dark/.test(m._olMedia);
    if (t === 'system') m.setAttribute('media', m._olMedia); else m.setAttribute('media', (t === 'dunkel') === dunkel ? 'all' : 'not all');
  });
}
if (settings.thema && settings.thema !== 'system') zentraleThema();
