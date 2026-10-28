// SPDX-License-Identifier: AGPL-3.0-only
// Vorschau – Knopf „Problem melden“ (Issue #46, Modul vorschau-melden). Nur in der Vorschau-Instanz (INSTANZ.speicher 'vorschau').
// Baut im Browser einen Link auf ein neues GitHub-Issue mit Stelle, Modus, Version, Sprache und Gerät – oder kopiert diese Angaben.
// Nichts geht an uns: das Issue legt der Prüfer selbst auf GitHub an. Teil von KOMPASS (klassisches Skript, globaler Namensraum).
const MELDEN_REPO = 'https://github.com/BFi-AI-247/KOMPASS/issues/new';
function meldenAn() { return INSTANZ.speicher === 'vorschau' && modulAn('vorschau-melden'); }
function meldenStelle() {
  const p = typeof cur === 'function' ? cur() : null;
  const ort = S.screen === 'settings' ? tt('Einstellungen') + ' → ' + (S.einstReiter || 'allgemein') : S.screen === 'onboarding' ? tt('Willkommen')
    : S.add ? tt('Quelle hinzufügen') + ' → ' + S.add.tab : S.overview ? tt('Übersicht') : S.filter ? tt('Filter') + ': ' + (S.filter.name || S.filter.key || '') : tt('Bühne');
  const zeilen = [
    '- ' + tt('Version') + ': ' + VERSION + ' (' + tt('Vorschau') + ')',
    '- ' + tt('Ansicht') + ': ' + modusAktuell() + ' · ' + ort,
    p ? '- ' + tt('Beitrag') + ': ' + String(p.title || p.text || '').replace(/\s+/g, ' ').slice(0, 120) + (p.link ? ' – ' + p.link : '') : null,
    '- ' + tt('Sprache') + ': ' + LANG + ' · ' + tt('Gerät') + ': ' + (isWide() ? tt('Laptop') : tt('Handy')) + ' ' + innerWidth + '×' + innerHeight,
    '- ' + tt('Browser') + ': ' + navigator.userAgent.replace(/\s+/g, ' ').slice(0, 160)
  ].filter(Boolean);
  return { titel: tt('Vorschau: ') + ort, text: tt('**Was ist passiert / was soll anders sein?**') + '\n\n\n' + tt('**Stelle**') + '\n' + zeilen.join('\n') };
}
function meldenIssue() {
  const s = meldenStelle();
  window.open(MELDEN_REPO + '?title=' + encodeURIComponent(s.titel) + '&body=' + encodeURIComponent(s.text), '_blank', 'noopener');
  S.melden = false; render();
}
async function meldenKopieren() {
  const s = meldenStelle();
  try { await navigator.clipboard.writeText(s.titel + '\n\n' + s.text); flash(tt('Stelle kopiert – in ein Issue einfügen.')); }
  catch (e) { flash(tt('Kopieren ging nicht – bitte „Issue öffnen“ nutzen.')); }
  S.melden = false; render();
}
// Wird von render() aufgerufen; der Knopf hängt am body, damit der Neuaufbau der App ihn nicht entfernt
function meldenZeichnen() {
  let el = document.getElementById('vorschau-melden');
  if (!meldenAn()) { if (el) el.remove(); return; }
  if (!el) { el = h('div', { id: 'vorschau-melden', class: 'melden' }); document.body.append(el); }
  const knopf = h('button', { type: 'button', class: 'mini melden-knopf', 'aria-expanded': S.melden ? 'true' : 'false', title: tt('Problem in der Vorschau melden'),
    onClick: () => { S.melden = !S.melden; meldenZeichnen(); } }, tt('⚑ Melden'));
  el.replaceChildren(...(S.melden ? [h('div', { class: 'melden-menue', role: 'group', 'aria-label': tt('Problem melden') },
    h('button', { type: 'button', class: 'mini primary', onClick: meldenIssue }, tt('Issue öffnen')),
    h('button', { type: 'button', class: 'mini', onClick: meldenKopieren }, tt('Stelle kopieren')))] : []), knopf);
}

// #54 (Modul vorschau-rahmen): Vorschau auf einen Blick erkennbar – Rahmen ganz außen (hell schwarz, dunkel weiß) und Etikett „VORSCHAU“
function vorschauRahmen() {
  const an = INSTANZ.speicher === 'vorschau' && modulAn('vorschau-rahmen');
  document.documentElement.classList.toggle('ist-vorschau', an);
  let el = document.getElementById('vorschau-rahmen');
  if (!an) { if (el) el.remove(); return; }
  if (!el) { el = h('div', { id: 'vorschau-rahmen', class: 'vorschau-rahmen', 'aria-hidden': 'true' }, h('span', { class: 'vorschau-etikett' }, tt('VORSCHAU'))); document.body.append(el); }
}
vorschauRahmen();
