// SPDX-License-Identifier: AGPL-3.0-only
// Startseite (Issue #43, Modul startseite): YOUR / SOCIAL / MEDIA / KOMPASS ~ OmegaLiberte, zentriert, Zeile für Zeile.
// Normaler Start: blendet aus, sobald der erste Beitrag da ist (spätestens nach 6 s, Antippen schließt sofort).
// Erststart: danach „Start“ und „Know more“; „Know more“ zeigt eine zweite Seite, „I want to try“ führt ins Willkommen.
// Liegt über der App (am body), damit render() sie nicht entfernt. Reduzierte Bewegung: alles sofort sichtbar.
// Logo: Entwurf Omega mit Fackel (SVG, #15) – Omega im Logo ist erlaubt, im Namen nicht.
const STARTSEITE = { el: null, seit: 0, erst: false, seite: 1, zu: false };
const STARTSEITE_LOGO = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">'
  + '<path d="M32 13c-11 0-19 8-19 18.5 0 7 3.6 12.3 8.6 15.5H13v5h15.5v-5.4c-5.3-2.3-9.3-7.6-9.3-15.1 0-7.6 5.6-13.3 12.8-13.3s12.8 5.7 12.8 13.3c0 7.5-4 12.8-9.3 15.1V52H51v-5h-8.6c5-3.2 8.6-8.5 8.6-15.5C51 21 43 13 32 13z" fill="currentColor"/>'
  + '<path d="M32 22c2.8 3 4.2 5.6 4.2 8.2 0 2.6-1.9 4.6-4.2 4.6s-4.2-2-4.2-4.6c0-1.4.6-2.6 1.6-3.8.2 1.4.9 2.3 1.9 2.6-.6-2.4-.3-4.6.7-7z" fill="var(--start-flamme)"/>'
  + '<rect x="30.2" y="35.5" width="3.6" height="11" rx="1.2" fill="currentColor"/></svg>';
function startseiteAn() { return modulAn('startseite'); }
function startseiteOeffnen() {
  if (!startseiteAn() || STARTSEITE.el) return;
  STARTSEITE.erst = !settings.onboarded; STARTSEITE.seit = Date.now(); STARTSEITE.seite = 1;
  STARTSEITE.el = h('div', { class: 'startseite' + (STARTSEITE.erst ? ' erst' : ''), role: 'dialog', 'aria-modal': STARTSEITE.erst ? 'true' : 'false', 'aria-label': INSTANZ.marke });
  if (!STARTSEITE.erst) STARTSEITE.el.addEventListener('click', () => startseiteSchliessen());
  document.body.append(STARTSEITE.el);
  startseiteZeichnen();
  if (!STARTSEITE.erst) setTimeout(() => startseiteSchliessen(), 6000);
}
function startseiteZeichnen() {
  const el = STARTSEITE.el; if (!el) return;
  const logo = h('div', { class: 'start-logo' }); logo.innerHTML = STARTSEITE_LOGO;
  if (STARTSEITE.seite === 1) {
    const zeilen = h('div', { class: 'start-zeilen' },
      h('div', { class: 'start-z', style: '--i:0' }, 'YOUR'), h('div', { class: 'start-z', style: '--i:1' }, 'SOCIAL'),
      h('div', { class: 'start-z', style: '--i:2' }, 'MEDIA'),
      h('div', { class: 'start-z start-marke', style: '--i:3' }, INSTANZ.marke, h('span', { class: 'start-tilde' }, ' ~ '), 'OmegaLiberte'));
    const knoepfe = STARTSEITE.erst ? h('div', { class: 'start-knoepfe', style: '--i:4' },
      h('button', { type: 'button', class: 'btn primary', onClick: () => startseiteSchliessen() }, tt('Start')),
      h('button', { type: 'button', class: 'btn', onClick: () => { STARTSEITE.seite = 2; startseiteZeichnen(); } }, tt('Mehr erfahren'))) : null;
    el.replaceChildren(h('div', { class: 'start-mitte' }, logo, zeilen, knoepfe));
  } else {
    el.replaceChildren(h('div', { class: 'start-mitte start-mehr' }, logo,
      h('p', { class: 'start-gross' }, tt('„Link in Bio“')), h('p', { class: 'start-klein' }, tt('Schon mal gelesen?')),
      h('p', {}, tt('E-Mails kommen überall an. Dein Messenger hält dich fest. Und Plattformen verstecken Links, damit du bleibst.')),
      h('p', {}, tt('Hier ist es anders: Social Media und Nachrichten an einem Ort – jeder Beitrag führt dich zur Quelle, und deine Daten bleiben bei dir.')),
      h('p', {}, tt('Du willst Hilfe von einer KI? Bring deine eigene mit.')),
      h('div', { class: 'start-knoepfe' }, h('button', { type: 'button', class: 'btn primary', onClick: () => startseiteSchliessen() }, tt('Ich will es ausprobieren')))));
  }
  const b = el.querySelector('button'); if (b && STARTSEITE.erst && STARTSEITE.seite === 2) b.focus();
}
function startseiteSchliessen() {
  const el = STARTSEITE.el; if (!el || STARTSEITE.zu) return;
  STARTSEITE.zu = true; el.classList.add('weg');
  setTimeout(() => { el.remove(); STARTSEITE.el = null; STARTSEITE.zu = false; }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400);
}
// Aus render(): beim normalen Start ausblenden, sobald der erste Beitrag da ist (die Zeilen dürfen sich zuerst zeigen)
function startseitePruefen() {
  if (!STARTSEITE.el || STARTSEITE.erst || STARTSEITE.zu || !S.posts.length) return;
  const rest = 1800 - (Date.now() - STARTSEITE.seit);
  if (rest <= 0) startseiteSchliessen(); else setTimeout(startseitePruefen, rest);
}
