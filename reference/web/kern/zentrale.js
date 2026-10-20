// SPDX-License-Identifier: AGPL-3.0-only
// Kern – eigener Name der Zentrale und freiwilliger Installations-Ping ins Zero Ledger. Nach basis.js geladen.
// Name: settings.name (leer = Instanz-Name), settings.olAnhang (Standard an) hängt „~OmegaLiberte“ an.
// Ping: nur nach Einwilligung; Zustand nur auf diesem Gerät (store 'ping', nicht im Abgleich – eine Installation, nicht eine Person).
const OL_ANHANG = '~OmegaLiberte';
const NAME_MAX = 24;
const PING_INTERVALL = 7 * 86400000;

function eigenerName() { return String(settings.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX); }
// Kopf, Seitenspalte, KI-Bühne: ohne eigenen Namen die Marke der Instanz (unverändert)
function zentraleMarke() { const n = eigenerName(); return n ? n + (settings.olAnhang !== false ? OL_ANHANG : '') : INSTANZ.marke; }
// Willkommen, Tab-Titel: ohne eigenen Namen der Instanz-Name
function zentraleName() { return eigenerName() ? zentraleMarke() : INSTANZ.name; }
// Versionszeile in den Einstellungen
function zentraleVersion() { const n = eigenerName() || 'Kompass'; return n + (settings.olAnhang !== false ? OL_ANHANG : '') + ' · ' + VERSION; }
// Tab-Titel und Name auf dem iPhone-Startbildschirm (Safari liest ihn beim „Zum Home-Bildschirm“); das Manifest bleibt beim Instanz-Namen
const TITEL0 = document.title;
function zentraleTitel() {
  if (!eigenerName()) { document.title = TITEL0; const m0 = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (m0) m0.remove(); return; }
  document.title = zentraleName();
  let m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (!m) { m = document.createElement('meta'); m.name = 'apple-mobile-web-app-title'; document.head.appendChild(m); }
  m.content = zentraleName();
}

// ---------- Zero Ledger ----------
function pingMoeglich() { return !!INSTANZ.ping; }
function pingZustand() { return store.get('ping', null); }
function pingAn() { const z = pingZustand(); return !!(z && z.an); }
function pingId() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24); }
function pingInstanz() { return (location.host + location.pathname.replace(/\/[^/]*$/, '')).toLowerCase().slice(0, 100); }
async function pingSenden() {
  const z = pingZustand(); if (!z || !z.an || !pingMoeglich()) return false;
  const art = z.offen || 'lebt';
  try {
    const r = await fetch(INSTANZ.ping, { method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: z.id, art, version: VERSION, sprache: LANG, instanz: pingInstanz() }) });
    if (!r.ok) return false;
    const neu = pingZustand(); if (!neu || !neu.an || neu.id !== z.id) return false;  // inzwischen widerrufen
    delete neu.offen; neu.letzt = Date.now(); store.set('ping', neu);
    return true;
  } catch (e) { return false; }
}
// Einwilligung: art „neu“ oder „bestehend“ (es gab schon Verlauf), genau ein Ping jetzt
function pingEinwilligen() {
  if (!pingMoeglich()) return;
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

// Bausteine für Einstellungen und Willkommen
function zentraleNameFeld(f) {
  const inp = h('input', { id: 'k-name', value: f.name || '', maxlength: String(NAME_MAX), placeholder: INSTANZ.marke, autocomplete: 'off', spellcheck: 'false',
    onInput: (e) => { f.name = e.target.value; } });
  const sw = h('button', { type: 'button', class: 'toggle-row', 'aria-pressed': f.olAnhang !== false ? 'true' : 'false',
    onClick: (e) => { f.olAnhang = f.olAnhang === false; e.currentTarget.setAttribute('aria-pressed', f.olAnhang ? 'true' : 'false'); } },
    h('span', { class: 'row-text' }, h('span', { style: 'font-size:15px' }, tt('„~OmegaLiberte“ anhängen')), h('span', { class: 'small' }, tt('Kennung deiner Zentrale, Standard ist an.'))),
    h('span', { class: 'switch' }));
  return h('div', { class: 'card-box' }, h('label', { for: 'k-name' }, h('h3', {}, tt('Name deiner Zentrale'))), h('div', { class: 'field' }, inp),
    h('span', { class: 'small' }, tt('Gib deiner Zentrale einen Namen. Ohne Eintrag heißt sie „{marke}“.').replace('{marke}', INSTANZ.marke)), sw);
}
function zentralePingBox(f) {
  if (!pingMoeglich()) return null;
  const mehr = h('details', { class: 'small ping-mehr' }, h('summary', {}, tt('Was genau?')),
    h('p', { style: 'margin:6px 0 0;line-height:1.5' }, tt('Gesendet: eine zufällige, auf dem Gerät erzeugte Installations-Nummer, die nichts über dich verrät; die Art („neu“, „bestehend“, „lebt“); App-Version und Sprache; die Instanz-Adresse (nicht deine). Wann: einmal bei Zustimmung, danach höchstens wöchentlich beim Öffnen. Wohin: Zero Ledger auf {ziel}. Nicht gesendet: Quellen, Konten, Zentralen-Name, Verlauf, Likes, Schlüssel. Die IP wird nicht gespeichert, nur 2 Stunden als Prüfsumme gegen Missbrauch. Gespeichert je Nummer: erste Art, erstes/letztes Datum, Version, Sprache, Instanz-Adresse. Widerruf jederzeit über das Kästchen – die Nummer wird auf dem Gerät gelöscht. Öffentlich sind nur Summen.').replace('{ziel}', hostOf(INSTANZ.ping))));
  const box = h('input', { type: 'checkbox', id: 'k-ping', onChange: (e) => { f.ping = e.target.checked; } });
  box.checked = !!f.ping;
  return h('div', { class: 'card-box' }, h('h3', {}, tt('Freiwilliger Installations-Ping')),
    h('label', { class: 'ping-zeile', for: 'k-ping' }, box,
      h('span', { class: 'small', style: 'line-height:1.5' }, tt('Melde deine Installation ans Zero Ledger auf {ziel}, damit OmegaLiberte zählen kann, wie viele es gibt. Einmal bei der Zustimmung, danach höchstens einmal pro Woche beim Öffnen. Es werden keine Quellen, Konten oder Verlaufsdaten gesendet.').replace('{ziel}', hostOf(INSTANZ.ping)))),
    mehr);
}
// Nach „Speichern“ / „Los geht’s“: Einwilligung umsetzen
function zentralePingUebernehmen(f) {
  if (!pingMoeglich()) return;
  if (f.ping && !pingAn()) { pingEinwilligen(); flash(tt('Danke! Deine Installation wird gezählt. Widerruf jederzeit über das Kästchen.')); }
  else if (!f.ping && pingAn()) { pingWiderrufen(); flash(tt('Alles klar. Es wird nichts mehr gesendet; die Nummer wurde auf deinem Gerät gelöscht.')); }
}
