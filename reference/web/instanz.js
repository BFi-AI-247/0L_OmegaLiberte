// SPDX-License-Identifier: AGPL-3.0-only
// Instanz – alles, was diese Installation im Browser von anderen unterscheidet. Wird vor allen anderen Skripten geladen.
// Eine andere Instanz ändert nur diese Datei und den Block „Instanz“ in api/_instanz.php (bzw. config.php).
// name: voller Name (Willkommen, Fuß, KI-Dienste) · marke: Kurzname für Kopf und Seitenspalte · betreiber: wer ai.php freigibt, je Sprache
// ping: Ziel für den freiwilligen Installations-Ping (kern/zentrale.js)
// module: Schalter je Modul, z. B. { schreiben: false } zieht ein Feature zurück (fehlt = an). Liste: ARCHITEKTUR.md
// speicher: eigener Speicherbereich im Browser, wenn mehrere Instanzen auf derselben Domain laufen (z. B. 'vorschau'); '' = Standard
// radar: RADAR-724-Dienste dieser Instanz (api/feed.php), [] = keine – dann fehlt der RADAR-Block in den Einstellungen
const INSTANZ = {
  name: 'Kompass~OmegaLiberte',
  marke: 'Kompass',
  betreiber: { de: 'der Betreiber', en: 'the operator' },
  radar: [],
  ping: 'https://digifil.de/kompass/api/ping.php',   // Zero Ledger (nur nach Einwilligung); '' = kein Ping-Angebot
  module: { 'ki-probe': false },   // #5: keine öffentliche KI-Probe über das Backend
  speicher: ''
};
