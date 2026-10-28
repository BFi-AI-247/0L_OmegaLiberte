// Sprache der Beiträge filtern (Issue #69, Modul sprachfilter). Teil von KOMPASS (klassisches Skript, globaler Namensraum).
// Woher die Sprache kommt: 1. Angabe der Plattform (Mastodon `language`, Bluesky `langs`, Feed <language>/xml:lang) –
// 2. sonst kleine Erkennung auf dem Gerät über häufige Wörter (kein Server). Zu kurzer oder unklarer Text = „unbekannt“ und bleibt sichtbar.
// Einstellung settings.sprachen: [] = alle; sonst Liste der Codes (reist im Abgleich mit).
const SPRACH_LISTE = ttFest(() => [['de', tt('Deutsch')], ['en', tt('Englisch')], ['fr', tt('Französisch')], ['es', tt('Spanisch')], ['it', tt('Italienisch')], ['nl', tt('Niederländisch')], ['pt', tt('Portugiesisch')]]);
const SPRACH_WOERTER = {
  de: 'der die das und ist nicht ein eine mit auf für von den dem zu im sich auch es ich wir sie bei nach wie aus über noch wird werden sind hat haben',
  en: 'the and is are of to in for on with that this it be was were from by at as an have has not you we they will about after',
  fr: 'le la les et est des une un du pour dans que qui pas sur au avec ce sont il elle nous vous par plus aux ses été',
  es: 'el la los las y es de que en un una por con para no se del al lo como más pero sus ha son está',
  it: 'il la le gli e è di che un una per con non si del della dei al sono più nel ha anche come',
  nl: 'de het een en is van in op dat niet met voor zijn er te aan ook als bij of door naar wordt worden',
  pt: 'o a os as e é de que em um uma para com não do da dos das no na se por mais foi são'
};
const SPRACH_SETS = Object.fromEntries(Object.entries(SPRACH_WOERTER).map(([k, v]) => [k, new Set(v.split(' '))]));
const SPRACH_CACHE = new Map();
function spracheErkennen(text) {
  const w = String(text || '').toLowerCase().match(/[\p{L}']+/gu) || [];
  if (w.length < 5) return '';
  const punkte = {}; for (const k in SPRACH_SETS) punkte[k] = 0;
  for (const x of w) for (const k in SPRACH_SETS) if (SPRACH_SETS[k].has(x)) punkte[k]++;
  const r = Object.entries(punkte).sort((a, b) => b[1] - a[1]);
  // mindestens 2 Treffer und deutlich vor der zweiten Sprache, sonst unbekannt
  return r[0][1] >= 2 && r[0][1] >= r[1][1] * 1.5 ? r[0][0] : '';
}
function beitragSprache(p) {
  if (!p) return '';
  if (p.sprache) return p.sprache;
  if (p.service === 'markt' || p.service === 'ki' || String(p.id).startsWith('ai:')) return '';
  if (SPRACH_CACHE.has(p.id)) return SPRACH_CACHE.get(p.id);
  const s = spracheErkennen((p.title || '') + ' ' + String(p.text || '').slice(0, 600));
  SPRACH_CACHE.set(p.id, s); return s;
}
function spracheErlaubt(p) {
  if (!modulAn('sprachfilter')) return true;
  const l = settings.sprachen; if (!Array.isArray(l) || !l.length) return true;
  const s = beitragSprache(p);
  return !s || l.includes(s);  // unbekannt bleibt sichtbar
}
// Einstellungen → Allgemein
function sprachfilterBox() {
  if (!modulAn('sprachfilter')) return null;
  const l = Array.isArray(settings.sprachen) ? settings.sprachen : [];
  const setzen = (neu) => { settings.sprachen = neu; save('settings'); render(true); };
  return h('div', { class: 'card-box' }, h('h3', {}, tt('Beiträge in diesen Sprachen')),
    h('div', { class: 'sprach-wahl' },
      h('button', { type: 'button', class: 'filter-pill', 'aria-pressed': l.length ? 'false' : 'true', onClick: () => setzen([]) }, tt('Alle')),
      SPRACH_LISTE.map(([k, n]) => h('button', { type: 'button', class: 'filter-pill', 'aria-pressed': l.includes(k) ? 'true' : 'false',
        onClick: () => setzen(l.includes(k) ? l.filter((x) => x !== k) : l.concat(k)) }, n))),
    h('span', { class: 'small', style: 'line-height:1.4' }, tt('Die Sprache kommt von Mastodon, Bluesky oder dem Feed; sonst erkennt sie dein Gerät am Text. Ist sie unklar, bleibt der Beitrag sichtbar.')));
}
