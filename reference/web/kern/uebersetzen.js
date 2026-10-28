// SPDX-License-Identifier: AGPL-3.0-only
// Übersetzen fremdsprachiger Beiträge (Issue #97, Modul uebersetzen). Teil von KOMPASS (klassisches Skript, globaler Namensraum).
// Festlegung (#97): beide Wege anbieten, Wahl in Einstellungen → Allgemein, am Beitrag nur ein kleiner Knopf.
//   'standard' – Übersetzung des Browsers: eingebauter Übersetzer (Translator-API, läuft auf dem Gerät); fehlt er,
//                Hinweis auf „Übersetzen“ im Browser-Menü (der Text trägt dafür sein lang-Attribut).
//   'ki'       – die eigene KI des Nutzers (Text geht direkt vom Gerät an seine KI). Ohne eigene KI: Standard-Weg.
//   'aus'      – kein Knopf.
// Ergebnis nur im Arbeitsspeicher (S.uebersetzt), nichts gespeichert oder abgeglichen.
// Sprachpaket des Browsers lädt nur nach Rückfrage (vgl. #96: KOMPASS lädt nichts von sich aus).
S.uebersetzt = {};
const UEB_ZIEL = { de: 'Deutsch', en: 'English' };
function uebWeg() { const w = settings.uebersetzen; return w === 'ki' || w === 'aus' ? w : 'standard'; }
function uebEigeneKi() { return typeof KI !== 'undefined' && KI.art() !== 'kompass' && KI.bereit(); }
function uebKey(p, v) { return p.id + '|' + ((v && v.service) || ''); }
// Sprache des Beitrags, wenn sie bekannt ist und von der App-Sprache abweicht – sonst ''
function uebFremd(p) {
  if (!modulAn('uebersetzen') || uebWeg() === 'aus' || !p) return '';
  const s = typeof beitragSprache === 'function' ? beitragSprache(p) : (p.sprache || '');
  return s && s !== LANG ? s : '';
}
function uebSprachName(code) { const e = SPRACH_LISTE.find((x) => x[0] === code); return e ? e[1] : code; }
function uebKlartext(v) { const d = document.createElement('div'); d.append(...[].concat(richNodes(v)).filter(Boolean)); return (d.textContent || '').replace(/\s+\n/g, '\n').trim(); }
// Übersetzte Fassung, wenn sie gerade gezeigt wird: { title, text }
function uebersetzung(p, v) { const t = S.uebersetzt[uebKey(p, v)]; return t && t.zeigen && t.fertig ? t : null; }

async function uebMitBrowser(von, titel, text) {
  if (!('Translator' in self)) throw Object.assign(new Error('fehlt'), { ohne: true });
  const o = { sourceLanguage: von, targetLanguage: LANG };
  const st = await Translator.availability(o).catch(() => 'unavailable');
  if (st === 'unavailable') throw Object.assign(new Error('fehlt'), { ohne: true });
  if (st !== 'available' && !confirm(tt('Dein Browser kann diese Sprache selbst übersetzen, braucht dafür aber einmalig ein Sprachpaket. Jetzt herunterladen?'))) throw new Error(tt('Nicht übersetzt.'));
  const tr = await Translator.create(o);
  try { return { title: titel ? await tr.translate(titel) : '', text: text ? await tr.translate(text) : '' }; }
  finally { try { tr.destroy(); } catch (e) { /* egal */ } }
}
async function uebMitKi(von, titel, text) {
  const sys = 'Du übersetzt Nachrichtenbeiträge sinngetreu und vollständig ins ' + UEB_ZIEL[LANG] + '. Namen, Zahlen und Zitate bleiben genau. '
    + 'Antworte nur mit JSON: {"titel":"…","text":"…"} – leere Felder bleiben leer.';
  const roh = await kiFrage([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify({ sprache: uebSprachName(von), titel, text }) }],
    { json: true, max: Math.min(3000, 400 + Math.round((titel.length + text.length) / 2)), lauf: 'uebersetzen' });
  const j = kiJson(roh) || {};
  if (!j.titel && !j.text) throw new Error(tt('Die KI hat keine Übersetzung geliefert.'));
  return { title: String(j.titel || ''), text: String(j.text || '') };
}
async function uebersetzen(p, v) {
  const k = uebKey(p, v); const alt = S.uebersetzt[k];
  if (alt && alt.fertig) { alt.zeigen = !alt.zeigen; render(true); return; }
  if (alt && alt.laeuft) return;
  const von = uebFremd(p); if (!von) return;
  const titel = String(p.title || '').slice(0, 400); const text = uebKlartext(v).slice(0, 4000);
  const ki = uebWeg() === 'ki' && uebEigeneKi();
  const st = S.uebersetzt[k] = { laeuft: true, weg: ki ? 'ki' : 'standard', von };
  render(true);
  try {
    Object.assign(st, ki ? await uebMitKi(von, titel, text) : await uebMitBrowser(von, titel, text), { fertig: true, zeigen: true });
  } catch (e) {
    delete S.uebersetzt[k];
    if (e.ohne) flash(tt('Dein Browser hat keinen eingebauten Übersetzer. Tipp: im Browser-Menü „Übersetzen“ wählen') + (uebEigeneKi() ? '' : tt(' – oder in den Einstellungen „Übersetzen mit KI“ wählen und deine KI verbinden.')));
    else flash(e.message || tt('Übersetzen hat nicht geklappt.'));
  }
  st.laeuft = false; render(true);
}
// Kleine Zeile unter dem Text: „Übersetzen · Französisch“ bzw. „Übersetzt aus Französisch · Original zeigen“
function uebZeile(p, v) {
  const von = uebFremd(p); if (!von) return null;
  const st = S.uebersetzt[uebKey(p, v)] || {};
  const name = uebSprachName(von);
  const knopf = st.laeuft ? tt('Übersetze …') : st.fertig && st.zeigen ? tt('Original zeigen') : st.fertig ? tt('Übersetzung zeigen') : tt('Übersetzen');
  const info = st.fertig && st.zeigen ? tt('Übersetzt aus: ') + name + (st.weg === 'ki' ? tt(' (deine KI)') : tt(' (Browser)')) : name;
  return h('div', { class: 'ueb-zeile' },
    h('button', { type: 'button', class: 'ueb-knopf', disabled: !!st.laeuft, 'aria-label': knopf + ' – ' + name, onClick: (e) => { e.stopPropagation(); uebersetzen(p, v); } },
      h('span', { 'aria-hidden': 'true', class: 'ueb-zeichen' }, '文A'), ' ', knopf),
    h('span', { class: 'ueb-info' }, info));
}
// Einstellungen → Allgemein
function uebersetzenBox() {
  if (!modulAn('uebersetzen')) return null;
  const w = uebWeg();
  const setzen = (neu) => { settings.uebersetzen = neu; save('settings'); render(true); };
  const wahl = [['standard', tt('Standard-Übersetzung')], ['ki', tt('Übersetzen mit KI')], ['aus', tt('Kein Knopf')]];
  return h('div', { class: 'card-box' }, h('h3', {}, tt('Fremdsprachige Beiträge übersetzen')),
    h('div', { class: 'ueb-wahl', role: 'group', 'aria-label': tt('Fremdsprachige Beiträge übersetzen') },
      wahl.map(([k, n]) => h('button', { type: 'button', class: 'filter-pill', 'aria-pressed': w === k ? 'true' : 'false', onClick: () => setzen(k) }, n))),
    h('span', { class: 'small', style: 'line-height:1.4' }, w === 'ki'
      ? tt('Deine eigene KI übersetzt – der Text geht direkt von deinem Gerät an sie.') + (uebEigeneKi() ? '' : ' ' + tt('Noch keine eigene KI verbunden: bis dahin übersetzt der Browser.'))
      : w === 'aus' ? tt('Kein Übersetzen-Knopf an den Beiträgen.')
        : tt('Der Browser übersetzt auf deinem Gerät, wenn er das kann. Sonst hilft „Übersetzen“ im Browser-Menü.')),
    h('span', { class: 'small', style: 'line-height:1.4' }, tt('Der Knopf „Übersetzen“ erscheint klein unter Beiträgen in einer anderen Sprache.')));
}
