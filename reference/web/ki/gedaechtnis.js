// SPDX-License-Identifier: AGPL-3.0-only
// Gedächtnis als lesbare Markdown-Datei (#95, Modul gedaechtnis). Teil von KOMPASS (Bereich KI-Modus).
// Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.
//
// Eine Datei „<profil>~Kompass~OmegaLiberte.md“ gehört dem Nutzer und ist für jede KI lesbar. Aufbau (feste Überschriften):
//   # Gedächtnis – <profil> · Kompass~OmegaLiberte
//   ## Landkarte      – eine Zeile je Abschnitt (wird erzeugt; die KI liest zuerst hier)
//   ## Über mich      – frei, vom Nutzer
//   ## Mehr davon / ## Weniger davon / ## Nie zeigen – dieselben Einträge wie ＋ / − / ⦸ im KI-Filter (settings.kiFilter)
//   ## Wunsch         – der KI-Wunsch (settings.aiWunsch)
//   ## Gelernt        – „JJJJ-MM-TT: …“, aufgeschrieben statt still gemerkt
//   weitere ## Abschnitte bleiben erhalten (nichts geht verloren)
// Schritt 1: Die Datei wird aus den Einstellungen gebildet und beim Speichern wieder dorthin zerlegt; Über mich, Gelernt und
// weitere Abschnitte liegen in settings.gedaechtnis und gehen damit über den bestehenden Abgleich mit. Dazu liegt die Datei als eigene
// .md im WebDAV-Ordner (gedDavSchreiben, aus syncNow in kern/speicher.js; Zustimmung des Betreibers in #95): nur geschrieben, geändert wird sie in KOMPASS.
// An jede eigene KI geht die Datei als Vorspann (kiFrage); kleine Modelle bekommen den „Auszug“ mit fester Obergrenze.
'use strict';

const GED_AUSZUG = { zeilen: 24, zeichen: 1200 };  // Auszug für kleine Modelle (Browser-KI, lokal, gesetzte Kontext-Grenze unter 16000)
const GED_VOLL = 6000;                               // Obergrenze der vollen Datei im KI-Vorspann
const GED_ABSCHNITTE = ['Über mich', 'Mehr davon', 'Weniger davon', 'Nie zeigen', 'Wunsch', 'Gelernt'];
const GED = { offen: false, entwurf: null, meldung: '' };

function gedDaten() { const g = settings.gedaechtnis; return g && typeof g === 'object' ? g : {}; }
function gedProfil() {
  let p = '';
  try { p = typeof davProfil === 'function' ? davProfil() : ''; } catch (e) { p = ''; }
  return (p || 'ich').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 40);
}
function gedDateiname() { return gedProfil() + '~Kompass~OmegaLiberte.md'; }
function gedZeilen(t) { return String(t || '').split('\n').map((z) => z.replace(/\s+$/, '')).filter((z) => z.trim()); }
function gedPunkt(z) { z = String(z).trim(); return /^[-*] /.test(z) ? '- ' + z.slice(2).trim() : '- ' + z; }

// Die Datei aus den Einstellungen bilden
function gedText() {
  const d = gedDaten(); const g = kifGruppen(); const wunsch = String(settings.aiWunsch || '').trim();
  const ueber = gedZeilen(d.ueber); const gelernt = (Array.isArray(d.gelernt) ? d.gelernt : []).filter(Boolean);
  const kurz = (l) => l.length ? l.slice(0, 6).join(', ') + (l.length > 6 ? ' … (' + l.length + ')' : '') : '–';
  const zuletzt = gelernt.length ? String(gelernt[gelernt.length - 1]).slice(0, 10) : '';
  const t = ['# Gedächtnis – ' + gedProfil() + ' · Kompass~OmegaLiberte', '',
    '> Diese Datei gehört dir. Jede KI darf sie lesen. Feste Überschriften – Zeilen mit „- “ sind Einträge.', '',
    '## Landkarte',
    '- Über mich: ' + (ueber.length ? ueber.length + (ueber.length === 1 ? ' Zeile' : ' Zeilen') : '–'),
    '- Mehr davon: ' + kurz(g.mehr), '- Weniger davon: ' + kurz(g.weniger), '- Nie zeigen: ' + kurz(g.nie),
    '- Wunsch: ' + (wunsch ? wunsch.slice(0, 80) + (wunsch.length > 80 ? ' …' : '') : '–'),
    '- Gelernt: ' + (gelernt.length ? gelernt.length + ' Einträge' + (zuletzt ? ', zuletzt ' + zuletzt : '') : '–'), '',
    '## Über mich', ...ueber.map(gedPunkt), '',
    '## Mehr davon', ...g.mehr.map((x) => '- ' + x), '',
    '## Weniger davon', ...g.weniger.map((x) => '- ' + x), '',
    '## Nie zeigen', ...g.nie.map((x) => '- ' + x), '',
    '## Wunsch', ...(wunsch ? [wunsch] : []), '',
    '## Gelernt', ...gelernt.map(gedPunkt), ''];
  (Array.isArray(d.weitere) ? d.weitere : []).forEach((a) => { if (a && a.titel) t.push('## ' + a.titel, ...gedZeilen(a.text), ''); });
  return t.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Datei → Abschnitte (Überschrift „## …“, Groß/klein egal; Landkarte und Titel werden neu erzeugt)
function gedLesen(text) {
  const ab = {}; const reihenfolge = []; let akt = null;
  String(text || '').replace(/\r/g, '').split('\n').forEach((z) => {
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(z);
    if (m) { akt = m[1].trim(); if (!ab[akt]) { ab[akt] = []; reihenfolge.push(akt); } return; }
    if (akt && !/^#\s/.test(z)) ab[akt].push(z);
  });
  const finde = (name) => reihenfolge.find((k) => k.toLowerCase() === name.toLowerCase());
  const eintraege = (name) => { const k = finde(name); return k ? ab[k].map((z) => z.trim()).filter(Boolean).map((z) => z.replace(/^[-*]\s+/, '').trim()).filter(Boolean) : null; };
  const roh = (name) => { const k = finde(name); return k ? ab[k].join('\n').trim() : null; };
  const bekannt = GED_ABSCHNITTE.concat(['Landkarte']).map((x) => x.toLowerCase());
  return {
    ueber: roh('Über mich'), mehr: eintraege('Mehr davon'), weniger: eintraege('Weniger davon'), nie: eintraege('Nie zeigen'),
    wunsch: roh('Wunsch'), gelernt: eintraege('Gelernt'),
    weitere: reihenfolge.filter((k) => !bekannt.includes(k.toLowerCase())).map((k) => ({ titel: k.slice(0, 80), text: ab[k].join('\n').trim().slice(0, 4000) }))
  };
}

// Abschnitte zurück in die Einstellungen; ＋/−/⦸ behalten ihre Schlüssel, wenn derselbe Name schon gesetzt war.
// Fehlt ein fester Abschnitt ganz, bleibt der alte Stand (nichts wird aus Versehen gelöscht).
function gedUebernehmen(text) {
  const x = gedLesen(text); const alt = kifWahl(); const neu = {};
  const hatFilter = x.mehr !== null || x.weniger !== null || x.nie !== null;
  if (hatFilter) {
    [['mehr', x.mehr], ['weniger', x.weniger], ['nie', x.nie]].forEach(([art, liste]) => {
      if (liste === null) { Object.entries(alt).forEach(([k, v]) => { if (v.art === art) neu[k] = v; }); return; }
      liste.forEach((name) => { name = kifName(name); if (!name) return;
        const k = Object.keys(alt).find((s) => kifSchluessel(alt[s].name || s) === kifSchluessel(name)) || kifSchluessel(name);
        neu[k] = { name, art }; });
    });
    settings.kiFilter = neu;
  }
  if (x.wunsch !== null) settings.aiWunsch = x.wunsch.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (x.wunsch !== null && S.form) S.form.aiWunsch = settings.aiWunsch;  // Feld „Wunsch“ derselben Seite nicht mit dem alten Wert zurückschreiben
  const d = Object.assign({}, gedDaten());
  if (x.ueber !== null) d.ueber = x.ueber.slice(0, 2000);
  if (x.gelernt !== null) d.gelernt = x.gelernt.map((z) => z.slice(0, 300)).slice(-200);
  d.weitere = x.weitere.slice(0, 20);
  d.stand = new Date().toISOString();
  settings.gedaechtnis = d;
  save('settings');
  if (typeof KIF !== 'undefined') KIF.geaendert = true;
}

// Auszug für kleine Modelle: Landkarte zuerst, dann was die Auswahl am stärksten lenkt (Nie, Wunsch, Mehr, Weniger), dann Über mich
function gedAuszug() {
  const d = gedDaten(); const g = kifGruppen(); const wunsch = String(settings.aiWunsch || '').trim();
  const z = ['Gedächtnis (Auszug) – ' + gedDateiname()];
  if (g.nie.length) z.push('Nie zeigen: ' + g.nie.join(', '));
  if (wunsch) z.push('Wunsch: ' + wunsch);
  if (g.mehr.length) z.push('Mehr davon: ' + g.mehr.join(', '));
  if (g.weniger.length) z.push('Weniger davon: ' + g.weniger.join(', '));
  gedZeilen(d.ueber).forEach((x) => z.push('Über mich: ' + x.replace(/^[-*]\s+/, '')));
  (Array.isArray(d.gelernt) ? d.gelernt : []).slice(-5).forEach((x) => z.push('Gelernt: ' + x));
  let out = []; let n = 0;
  for (const x of z.slice(0, GED_AUSZUG.zeilen)) { const s = x.slice(0, 200); if (n + s.length + 1 > GED_AUSZUG.zeichen) break; out.push(s); n += s.length + 1; }
  return out.join('\n');
}
function gedLeer() { const d = gedDaten(); const g = kifGruppen(); return !gedZeilen(d.ueber).length && !(d.gelernt || []).length && !String(settings.aiWunsch || '').trim() && !g.mehr.length && !g.weniger.length && !g.nie.length && !(d.weitere || []).length; }

// Vorspann für jede eigene KI (aus kiFrage aufgerufen). Probe/Einladung über unseren Server bekommen ihn nicht.
function gedVorspann(msgs) {
  if (!modulAn('gedaechtnis') || gedLeer() || !Array.isArray(msgs)) return msgs;
  const klein = KI.klein() || (typeof kiKontext === 'function' && kiKontext() && kiKontext() < 16000);  // mit Kontext-Grenze (Stücke) immer der Auszug
  const inhalt = klein ? gedAuszug() : gedText().slice(0, GED_VOLL);
  return [{ role: 'system', content: 'Das Gedächtnis des Nutzers – seine eigene Datei, sie gilt für alle Antworten. „Nie zeigen“ ist streng, „Mehr/Weniger davon“ und „Wunsch“ lenken die Auswahl:\n\n' + inhalt }].concat(msgs);
}

function gedHerunterladen() {
  const a = h('a', { href: URL.createObjectURL(new Blob([gedText()], { type: 'text/markdown;charset=utf-8' })), download: gedDateiname() });
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// Einstellungen → KI: Kasten „Dein Gedächtnis“ – Datei lesen, direkt bearbeiten, herunterladen; Auszug für kleine KIs aufklappbar
function gedBox() {
  if (!modulAn('gedaechtnis')) return null;
  const text = GED.entwurf != null ? GED.entwurf : gedText();
  const feld = h('textarea', { id: 'k-gedaechtnis', class: 'ged-feld', rows: GED.offen ? 18 : 10, spellcheck: 'false', 'aria-label': tt('Dein Gedächtnis als Markdown'),
    onInput: (e) => { GED.entwurf = e.target.value; GED.meldung = ''; } });
  feld.value = text;
  return h('div', { class: 'card-box ged-box' }, h('h3', {}, tt('Dein Gedächtnis')),
    h('p', { class: 'small', style: 'margin:0;line-height:1.5' }, tt('Eine Datei, die dir gehört: Sie geht an jede KI, die du verbindest, und lässt sich mit jeder KI weiter nutzen. ＋ / − / ⦸ im KI-Filter und dein Wunsch stehen hier mit drin.')),
    h('span', { class: 'small ged-name' }, '📄 ' + gedDateiname()),
    feld,
    h('div', { class: 'ki-btns' },
      h('button', { type: 'button', class: 'mini primary', onClick: () => { gedUebernehmen(feld.value); GED.entwurf = null; GED.meldung = tt('Gespeichert – gilt ab der nächsten KI-Anfrage.'); render(); } }, tt('Speichern')),
      GED.entwurf != null ? h('button', { type: 'button', class: 'mini', onClick: () => { GED.entwurf = null; GED.meldung = ''; render(); } }, tt('Verwerfen')) : null,
      h('button', { type: 'button', class: 'mini', onClick: gedHerunterladen }, tt('Herunterladen (.md)'))),
    GED.meldung ? h('span', { class: 'small', role: 'status' }, GED.meldung) : null,
    h('details', { class: 'ged-auszug' }, h('summary', { class: 'small' }, tt('Auszug für kleine KIs (höchstens {z} Zeilen)').replace('{z}', GED_AUSZUG.zeilen)),
      h('pre', { class: 'ged-pre' }, gedAuszug())),
    h('span', { class: 'small' }, tt('Wandert mit den Einstellungen in deinen Abgleich und liegt als eigene Datei in deinem WebDAV-Ordner – zum Lesen und Mitnehmen; ändern kannst du sie hier.')));
}

// #95: eigene .md-Datei im WebDAV-Ordner (KOMPASS/ bzw. KOMPASS/<profil>/). Nur schreiben, nur wenn sich Text oder Ziel geändert hat;
// ein Fehler hier hält den Abgleich der JSON-Dateien nicht auf.
async function gedDavSchreiben(conn) {
  if (!modulAn('gedaechtnis') || !conn || typeof conn.write !== 'function') return;
  try {
    const text = gedText(); const name = gedDateiname(); const ziel = (typeof conn.folderUrl === 'function' ? conn.folderUrl() : '') + name;
    const merk = store.get('gedDav', {}) || {};
    if (merk.text === text && merk.ziel === ziel) return;
    await conn.write(encodeURIComponent(name), text);
    store.set('gedDav', { text, ziel });
  } catch (e) { /* Datei folgt beim nächsten Abgleich */ }
}
