// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Sprachen. ttt('Deutscher Text') liefert die Übersetzung der aktiven Sprache oder den Originaltext.
// Sprachdateien (lang/<code>.js) setzen SPRACHE.<code> = { 'Deutscher Text': 'Übersetzung', … }. Fehlende Einträge → Original.
// Aktive Sprache: Einstellung „sprache“, sonst Browsersprache (de → Deutsch, alles andere → Englisch). Wechsel ohne Neuladen: spracheSetzen() (#44).
// Teil von KOMPASS. Wird vor allen anderen Skripten geladen.
var SPRACHE = window.SPRACHE || {};
const SPRACHEN = [['de', 'Deutsch'], ['en', 'English']];
let LANG = (() => {
  // Gleicher Schlüssel wie kern/basis.js (LS): Instanzen mit eigenem Speicherbereich (Vorschau) lesen sonst die falsche Einstellung (#41).
  const ls = 'kompass.v0.' + ((typeof INSTANZ !== 'undefined' && INSTANZ.speicher) ? INSTANZ.speicher + '.' : '');
  try { const s = JSON.parse(localStorage.getItem(ls + 'settings') || '{}'); if (s.sprache && SPRACHEN.some((x) => x[0] === s.sprache)) return s.sprache; } catch (e) { /* ohne Speicher */ }
  return /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
})();
document.documentElement.lang = LANG;
function tt(s) { const d = LANG === 'de' ? null : SPRACHE[LANG]; return (d && d[s]) || s; }
// Beim Laden übersetzte Tabellen (Reiter, Beschriftungen) folgen dem Sprachwechsel: ttFest(() => ({…})) baut sie neu
// und ersetzt den Inhalt im selben Objekt/Array; für einzelne Werte beiSprachwechsel(() => { X = tt('…'); }).
const SPRACH_WECHSEL = [];
function beiSprachwechsel(fn) { SPRACH_WECHSEL.push(fn); }
function ttFest(bau) {
  const v = bau();
  beiSprachwechsel(() => { const n = bau(); if (Array.isArray(v)) v.splice(0, v.length, ...n); else { Object.keys(v).forEach((k) => { delete v[k]; }); Object.assign(v, n); } });
  return v;
}
// Sprache wechseln ohne Neuladen: Einstellung speichern, Tabellen neu bauen, alles neu zeichnen (#44)
function spracheSetzen(code) {
  if (!SPRACHEN.some((x) => x[0] === code) || code === LANG) return false;
  LANG = code; document.documentElement.lang = code;
  SPRACH_WECHSEL.forEach((f) => { try { f(); } catch (e) { /* einzelne Tabelle */ } });
  return true;
}
