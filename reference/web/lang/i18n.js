// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Sprachen. ttt('Deutscher Text') liefert die Übersetzung der aktiven Sprache oder den Originaltext.
// Sprachdateien (lang/<code>.js) setzen SPRACHE.<code> = { 'Deutscher Text': 'Übersetzung', … }. Fehlende Einträge → Original.
// Aktive Sprache: Einstellung „sprache“, sonst Browsersprache (de → Deutsch, alles andere → Englisch). Wechsel lädt die Seite neu.
// Teil von KOMPASS. Wird vor allen anderen Skripten geladen.
var SPRACHE = window.SPRACHE || {};
const SPRACHEN = [['de', 'Deutsch'], ['en', 'English']];
const LANG = (() => {
  // Gleicher Schlüssel wie kern/basis.js (LS): Instanzen mit eigenem Speicherbereich (Vorschau) lesen sonst die falsche Einstellung (#41).
  const ls = 'kompass.v0.' + ((typeof INSTANZ !== 'undefined' && INSTANZ.speicher) ? INSTANZ.speicher + '.' : '');
  try { const s = JSON.parse(localStorage.getItem(ls + 'settings') || '{}'); if (s.sprache && SPRACHEN.some((x) => x[0] === s.sprache)) return s.sprache; } catch (e) { /* ohne Speicher */ }
  return /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
})();
document.documentElement.lang = LANG;
function tt(s) { const d = LANG === 'de' ? null : SPRACHE[LANG]; return (d && d[s]) || s; }
