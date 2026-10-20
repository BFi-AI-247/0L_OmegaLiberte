// SPDX-License-Identifier: AGPL-3.0-only
// KI-Modus – KI-Auswahl, Band, Lage-Karte, Notizen an Karten; meldet sich über modusRegistrieren() an. Besitzer: KI-Modus.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- KI-Auswahl (KI-Modus) -------------------------------------------
   Der Agent wählt aus den ungelesenen Beiträgen der letzten 48 Stunden höchstens 20 aus, bündelt
   gleiche Geschichten zu Themen („Heute in deinen Quellen“) und begründet jede Auswahl.
   Chronologisch bleibt der Standard; der KI-Modus ist an Farbe, Band und Marken erkennbar. */
function aiActive() { return !!(S.ai.on && !S.filter && S.ai.res && S.ai.res.auswahl && S.ai.res.auswahl.length); }
function lageId() { return S.ai.res ? 'ai:lage:' + S.ai.res.at : ''; }
function aiPrepare() {
  if (!S.ai.res) return;
  const r = S.ai.res;
  S.byId[lageId()] = { id: lageId(), service: 'ki', tags: [], who: 'KI-Auswahl', whoKey: 'ki', title: tt('Heute in deinen Quellen'), text: '', date: new Date(r.at).toISOString(), media: [] };
  S.aiWhy = {}; S.aiTheme = {}; KIB.gewicht = {};
  (r.auswahl || []).forEach((a) => { S.aiWhy[a.id] = a.warum; if (a.gewicht) KIB.gewicht[a.id] = Math.max(1, Math.min(3, Math.round(+a.gewicht) || 1)); });
  (r.lage || []).forEach((t, i) => (t.ids || []).forEach((id) => { if (S.aiTheme[id] == null) S.aiTheme[id] = i; }));
  kibGruppieren();
  // Lage und Themen als eigene Einträge: Ebene der KI-Bühne und Gegenstand des Chats rechts
  const zeile = (p) => '– ' + entryNameOf(p) + ': ' + (p.title || String(p.text || '').replace(/\s+/g, ' ').slice(0, 140));
  S.byId[lageId()].text = (r.lage || []).map((t) => t.thema + ': ' + t.satz).join('\n');
  (r.lage || []).forEach((t, i) => {
    const ps = (t.ids || []).map((id) => S.byId[id]).filter(Boolean);
    S.byId[themaId(i)] = { id: themaId(i), service: 'ki', tags: [], who: tt('Thema „') + t.thema + '“', whoKey: 'ki', title: t.thema,
      text: t.satz + tt('\n\nBeiträge dazu in deinen Quellen:\n') + ps.map(zeile).join('\n'), date: new Date(r.at).toISOString(), media: [] };
  });
}
function entryNameOf(p) { return (S.entries[p.whoKey] || {}).name || p.who || ''; }
// weiter = { stunden }: weitere Runde – nur Ungelesenes, das noch nicht ausgewählt ist; Ergebnis wird angehängt (kibNachlegen)
async function curate(weiter) {
  if (!weiter || !weiter.stunden) weiter = null;  // auch als Klick-Handler (Ereignis als Argument)
  if (S.ai.busy) return;
  if (weiter && !S.ai.res) return 'fehler';
  const wunsch = String(settings.aiWunsch || '').trim();
  const lim = Date.now() - (weiter ? weiter.stunden : wunsch ? 96 : 48) * 3600000;
  const schon = weiter ? kibSchonAusgewaehlt() : null; const r0 = S.ai.res;
  let pool = chronoVisible().filter((p) => !S.seen[sk(p.id)] && (Date.parse(p.date) || 0) >= lim && !(schon && schon.has(p.id)));
  // Wunsch-Wörter (z. B. „Sport“) vorziehen, damit passende Beiträge sicher in der Liste landen
  const STOP = new Set(['zeig', 'zeige', 'mehr', 'weniger', 'bitte', 'über', 'ueber', 'auch', 'eher', 'viel', 'keine', 'kein', 'nicht', 'gerne', 'thema', 'themen', 'news', 'nachrichten']);
  const words = wunsch.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const stem = (w) => w.replace(/(en|er|e|s|n)$/, '');
  const hits = (p) => { const hay = ((p.title || '') + ' ' + (p.text || '') + ' ' + entryNameOf(p) + ' ' + (p.link || '')).toLowerCase(); return words.some((w) => hay.includes(stem(w))); };
  const match = words.length ? pool.filter(hits) : [];
  if (match.length) pool = match.concat(pool.filter((p) => !match.includes(p)));
  const cand = pool.slice(0, wunsch ? 150 : 120);
  if (weiter && cand.length < 3) return 'leer';
  if (cand.length < 3) { S.ai.err = tt('Zu wenig Ungelesenes aus den letzten 48 Stunden für eine Auswahl.'); render(true); return; }
  if (!weiter) { S.ai.busy = true; S.ai.err = ''; render(); }
  const body = {
    kandidaten: cand.map((p) => {
      const t = String(p.text || '').replace(/\s+/g, ' ').trim();
      return { id: p.id, quelle: entryNameOf(p), titel: p.title || t.slice(0, 140), text: p.title ? t.slice(0, 220) : t.slice(140, 360) };
    }),
    wunsch: settings.aiWunsch || '',
    favoriten: Object.keys(S.favs).map((k) => (S.entries[k] || {}).name).filter(Boolean),
    anzahl: 20
  };
  try {
    let d;
    if (KI.art() !== 'kompass' && KI.bereit()) {
      d = Object.assign({ status: 'ok' }, await kiKuratieren(body.kandidaten, body.wunsch, body.favoriten, body.anzahl));
    } else {
      const r = await fetch('api/kurator.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      d = await r.json().catch(() => ({}));
      if (d.status === 'limit' || d.status === 'pause') d.antwort = (d.antwort || '') + tt(' Verbinde deine eigene KI in den Einstellungen.');
    }
    if (d.status !== 'ok') throw new Error(d.antwort || tt('Die KI-Auswahl hat gerade nicht geklappt.'));
    if (weiter) {
      // Anhängen: at bleibt (Ids der Themen hängen daran), neue Themen hinten, gleiche Beiträge nicht doppelt
      const r = S.ai.res; if (r !== r0) return 'fehler';  // inzwischen neu kuratiert
      const da = kibSchonAusgewaehlt();
      const lage = (d.lage || []).map((x) => Object.assign({}, x, { ids: (x.ids || []).filter((id) => !da.has(id)), runde: (r.runde || 1) + 1 })).filter((x) => x.ids.length);
      if (!lage.length) return 'leer';
      r.lage = r.lage.concat(lage); r.auswahl = r.auswahl.concat((d.auswahl || []).filter((a) => !da.has(a.id)));
      r.n += cand.length; r.runde = (r.runde || 1) + 1; r.nachAt = Date.now();
      store.set('aiRes', r); aiPrepare();
      return 'ok';
    }
    KIB.nachLeer = false; KIB.weiter = null;
    S.ai.res = { lage: d.lage || [], auswahl: d.auswahl || [], ueberschrift: String(d.ueberschrift || '').slice(0, 90), at: Date.now(), n: cand.length, quellen: new Set(cand.map(entryNameOf)).size,
      wunsch, treffer: words.length ? match.length : null, hinweis: String(d.hinweis || '').slice(0, 240),
      von: KI.art() !== 'kompass' && KI.bereit() ? KI.name() : tt('Mistral (KOMPASS-Probe)') };
    if (words.length && !match.length && !S.ai.res.hinweis) S.ai.res.hinweis = 'Zu „' + wunsch + tt('“ finde ich in deinen ungelesenen Beiträgen nichts. Füge passende Quellen hinzu.');
    store.set('aiRes', S.ai.res);
    aiPrepare();
    S.ai.busy = false;
    // Während des Kuratierens umgeschaltet (Chronologisch, Quelle gewählt): nicht in die KI-Auswahl springen
    if (!aiActive()) { kibStapelOhneKi(); render(); return; }
    S.stack = S.stack.slice(0, S.pos + 1);
    show(lageId(), 'up');
    if (S.ai.res.hinweis) flash(S.ai.res.hinweis);
  } catch (e) {
    if (weiter) { KIB.nachFehler = e.message || ''; return 'fehler'; }
    S.ai.busy = false; S.ai.err = e.message || tt('Die KI-Auswahl hat gerade nicht geklappt.'); render(true); flash(S.ai.err);
  }
}
function setAiMode(on) {
  S.ai.on = on; store.set('aiOn', on); S.filter = null; S.overview = false;
  S.stack = S.stack.slice(0, S.pos + 1);
  if (on) {
    const stale = !S.ai.res || Date.now() - S.ai.res.at > 60 * 60000;
    if (stale) { render(true); curate(); return; }
    aiPrepare(); show(lageId(), 'up'); flash(tt('KI-Auswahl – kuratiert von ') + KI.name() + tt(' aus deinen Quellen.'));
  } else { kibStapelOhneKi(); render(true); next(true); flash(tt('Chronologisch – alle Beiträge, neueste zuerst.')); }
}
// Lage und Themen gibt es nur in der KI-Auswahl: alle „ai:“-Einträge aus dem Stapel nehmen, damit weder
// zurück noch weiter im Social-Modus auf sie führt. Die Position bleibt auf dem letzten echten Beitrag davor.
function kibStapelOhneKi() {
  const ki = (id) => String(id || '').startsWith('ai:');
  if (!S.stack.some(ki)) return false;
  let pos = -1;
  const neu = [];
  S.stack.forEach((id, k) => { if (!ki(id)) { neu.push(id); if (k <= S.pos) pos = neu.length - 1; } });
  S.stack = neu; S.pos = pos; S.ended = false;
  return true;
}
// Sicherheitsnetz: gerät doch ein KI-Eintrag auf die Social-Bühne, wird er entfernt und der nächste Beitrag gezeigt
function kibAufraeumen() {
  if (aiActive() || !kibStapelOhneKi()) return;
  if (cur()) render(true); else next(true);
}
function aiToggle(wide) {
  return h('button', { type: 'button', class: wide ? 'ai-toggle wide' : 'icon-btn ai-toggle', 'aria-pressed': S.ai.on ? 'true' : 'false',
    title: S.ai.on ? tt('KI-Auswahl aus – chronologisch') : tt('KI-Auswahl an'), 'aria-label': tt('KI-Auswahl ') + (S.ai.on ? 'ausschalten' : 'einschalten'), onClick: () => setAiMode(!S.ai.on) },
    h('span', { class: 'ai-spark' }, '✦'), wide ? (S.ai.on ? tt(' KI-Auswahl an') : tt(' KI-Auswahl')) : null);
}
function aiBand() {
  if (!S.ai.on) return null;
  if (kibAn()) return kibKopf();
  const r = S.ai.res;
  const tm = r ? new Date(r.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  const st = S.ai.busy ? tt('Mistral liest deine ungelesenen Beiträge …')
    : S.ai.err ? S.ai.err
      : S.filter ? tt('Pausiert, solange eine Quelle gewählt ist – hier chronologisch.')
        : r ? tt('Stand ') + tm + ' · ' + r.auswahl.length + ' von ' + r.n + tt(' Beiträgen aus ') + r.quellen + tt(' Quellen') : tt('Noch keine Auswahl');
  return h('div', { class: 'ai-band' + (S.ai.err ? ' err' : '') },
    h('div', { class: 'ai-band-row' },
      h('span', { class: 'ai-band-title' }, h('span', { class: 'ai-spark' }, '✦'), tt(' KI-Auswahl')),
      h('span', { class: 'ai-band-st' }, st),
      h('span', { class: 'ai-band-btns' },
        h('button', { type: 'button', class: 'mini', disabled: S.ai.busy, onClick: () => { S.ai.wunschOpen = !S.ai.wunschOpen; render(); } }, tt('Wunsch')),
        h('button', { type: 'button', class: 'mini primary', disabled: S.ai.busy, onClick: curate }, S.ai.busy ? tt('Kuratiere …') : tt('Neu kuratieren')))),
    S.ai.wunschOpen ? h('div', { class: 'ai-wunsch' },
      h('label', { for: 'k-wunsch', class: 'sr' }, tt('Was soll die KI beachten?')),
      h('input', { id: 'k-wunsch', value: S.ai.wunschDraft != null ? S.ai.wunschDraft : (settings.aiWunsch || ''), placeholder: tt('Was soll die KI beachten? z. B. mehr Raumfahrt, weniger Fußball'),
        autocomplete: 'off', onInput: (e) => { S.ai.wunschDraft = e.target.value; },
        onKeydown: (e) => { if (e.key === 'Enter') saveWunsch(); } }),
      h('button', { type: 'button', class: 'mini primary', onClick: saveWunsch }, tt('Übernehmen'))) : null);
}
function aiStatusShort() {
  const r = S.ai.res;
  if (S.ai.busy) return tt('Kuratiere …');
  if (S.ai.err) return tt('Fehler – antippen');
  if (!r) return tt('Noch keine Auswahl');
  return r.auswahl.length + ' von ' + r.n + ' · ' + new Date(r.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function saveWunsch() {
  settings.aiWunsch = String(S.ai.wunschDraft != null ? S.ai.wunschDraft : settings.aiWunsch || '').trim().slice(0, 400);
  S.ai.wunschDraft = null; S.ai.wunschOpen = false; save('settings'); curate();
}
function lageCard(c) {
  const r = S.ai.res || { lage: [], auswahl: [] };
  const inAuswahl = new Set(r.auswahl.map((a) => a.id));
  return h('article', { class: 'card lage-card' },
    h('div', { class: 'card-head' }, h('span', { class: 'av ai-av', style: 'width:40px;height:40px' }, '✦'),
      h('span', { class: 'card-who' }, h('b', {}, tt('Heute in deinen Quellen')), h('span', { class: 'card-meta' }, tt('KI-Auswahl · ') + (r.von || 'Mistral') + ' · ' + ago(c.date)))),
    h('div', { class: 'card-body' },
      r.wunsch ? h('div', { class: 'ai-note' }, h('span', { class: 'ai-why' }, h('span', { class: 'ai-spark' }, '✦'), tt(' Dein Wunsch: „') + r.wunsch + '“' +
        (r.treffer != null ? ' · ' + (r.treffer ? r.treffer + tt(' passende Beiträge gefunden') : tt('nichts Passendes in deinen Quellen')) : '')),
        r.hinweis ? h('span', { class: 'ai-also' }, r.hinweis) : null,
        r.hinweis || r.treffer === 0 ? h('button', { type: 'button', class: 'mini primary', style: 'align-self:flex-start;margin-top:4px', onClick: () => openAdd('ki', r.wunsch) }, tt('✦ KI nach passenden Quellen fragen')) : null) : null,
      r.lage.length ? r.lage.map((t) => {
        const ps = t.ids.map((id) => S.byId[id]).filter(Boolean);
        const quellen = [...new Set(ps.map(entryNameOf))];
        const ziel = t.ids.find((id) => inAuswahl.has(id) && S.byId[id]) || (ps[0] && ps[0].id);
        return h('button', { type: 'button', class: 'lage-item', disabled: !ziel, onClick: () => ziel && show(ziel, 'up') },
          h('b', {}, t.thema), h('span', { class: 'lage-satz' }, t.satz),
          h('span', { class: 'lage-q' }, quellen.length ? quellen.slice(0, 4).join(' · ') + (quellen.length > 4 ? ' · +' + (quellen.length - 4) : '') + (quellen.length > 1 ? ' · ' + quellen.length + tt(' Quellen') : '') : ''));
      }) : h('p', { class: 'card-text' }, tt('Keine Themen erkannt.')),
      h('p', { class: 'small', style: 'margin:0' }, tt('Die KI kennt nur, was deine Quellen berichten – keine eigene Recherche, keine Weltlage. Weiter blättern zeigt ihre ') + r.auswahl.length + tt(' ausgewählten Beiträge.'))),
    h('div', { class: 'card-foot' }, h('span', {}, isWide() ? tt('Mausrad, ↑ ↓ oder Leertaste: weiter') : tt('Hochwischen: zur Auswahl')), h('span', {})));
}
function aiNote(p, part) {
  if (!aiActive() || !S.aiWhy || !(p.id in S.aiWhy)) return null;
  const ti = S.aiTheme[p.id];
  const t = ti != null ? S.ai.res.lage[ti] : null;
  const seenW = new Set([p.whoKey]);
  const others = t ? t.ids.filter((id) => { const q = S.byId[id]; if (!q || id === p.id || seenW.has(q.whoKey)) return false; seenW.add(q.whoKey); return true; }) : [];
  if (part === 'also' && kibAn()) return null; // Laptop: „Auch berichtet von“ steht rechts unten neben der Karte
  if (part === 'also') return others.length ? h('div', { class: 'ai-also' }, tt('Auch berichtet von: '),
    others.slice(0, 4).map((id, i) => [i ? ' · ' : '', h('button', { type: 'button', class: 'ai-also-btn', onClick: () => show(id, 'up') }, entryNameOf(S.byId[id]))])) : null;
  if (part === 'why') return h('div', { class: 'ai-note ai-note-top' }, h('span', { class: 'ai-why' }, h('span', { class: 'ai-spark' }, '✦'), ' ', S.aiWhy[p.id] || tt('Von der KI ausgewählt')));
  return h('div', { class: 'ai-note' },
    h('span', { class: 'ai-why' }, h('span', { class: 'ai-spark' }, '✦'), ' ', S.aiWhy[p.id] || tt('Von der KI ausgewählt')),
    others.length ? h('span', { class: 'ai-also' }, tt('Auch berichtet von: '),
      others.slice(0, 4).map((id, i) => [i ? ' · ' : '', h('button', { type: 'button', class: 'ai-also-btn', onClick: () => show(id, 'up') }, entryNameOf(S.byId[id]))])) : null);
}

/* ---------- KI-Bühne (Laptop): Mosaik → Thema (2×2) → volle Karte ----------------------
   Die Ebene folgt dem aktuellen Eintrag im Stapel: Lage = Mosaik, Thema-Eintrag = Thema, Beitrag = Karte.
   So laufen Zurück, Gesehen und der Chat-Bezug über die Kern-Navigation (show).
   Handy und schmale Fenster: weiter die Bühne des Social-Modus. */
const KIB = { gewicht: {}, zu: {}, auch: {}, zeile: {}, liste: [], thema: -1, fokus: null, alsListe: false, dom: null, ebene: '', sperre: false,
  weiter: null, nach: null, nachLeer: false, nachFehler: '' };
const KIB_FARBEN = ['#2A3550', '#272246', '#22402F', '#3A2A22', '#1C3340', '#3A2132', '#33283F', '#203A3A'];
const KIB_RAND = 28; const KIB_ABSTAND = 6; // Andeutung oben/unten im 2×2, Abstand der Kacheln
function kibAn() { return aiActive() && isWide(); }
function themaId(i) { return 'ai:thema:' + (S.ai.res ? S.ai.res.at : 0) + ':' + i; }
function themaIndex(id) {
  const m = /^ai:thema:(\d+):(\d+)$/.exec(String(id || ''));
  return m && S.ai.res && +m[1] === S.ai.res.at && S.ai.res.lage[+m[2]] ? +m[2] : -1;
}
function kibEbene() {
  const c = cur();
  if (!c || c.id === lageId()) return 'mosaik';
  if (themaIndex(c.id) >= 0) return 'thema';
  return c.service === 'ki' ? 'mosaik' : 'karte';
}
function kibFarbe(i) { return KIB_FARBEN[i % KIB_FARBEN.length]; }
function kibBild(p) {
  const v = (p.variants || [p]).find((x) => x.thumb || x.video || (x.media && x.media.length) || (x.card && x.card.image)) || p;
  if (v.thumb) return v.thumb;
  if (v.video) return 'https://i.ytimg.com/vi/' + v.video + '/hqdefault.jpg';
  if (v.media && v.media[0]) return v.media[0];
  return (v.card && v.card.image) || '';
}
// Bild eines Beitrags, sonst das erste Bild derselben Geschichte
function kibBildGruppe(p) { return kibBild(p) || (KIB.auch[p.id] || []).map((id) => S.byId[id] && kibBild(S.byId[id])).find(Boolean) || ''; }
function kibVideo(p) { return (p.variants || [p]).some((x) => x.video || x.medien); }
function kibGesehen(p) { return !!S.seen[sk(p.id)]; }
// Reihenfolge im Thema: Gewicht mit Bild, dann Gewicht, dann neueste. Oben nichts Altes, solange es Neueres gibt.
function kibReihe(t) {
  const ps = [...new Set(t.ids || [])].map((id) => S.byId[id]).filter(Boolean);
  const g = (p) => KIB.gewicht[p.id] || 0;
  const rang = (p) => (g(p) ? (kibBildGruppe(p) ? 2 : 1) : 0);
  const zeit = (p) => Date.parse(p.date) || 0;
  ps.sort((a, b) => rang(b) - rang(a) || g(b) - g(a) || zeit(b) - zeit(a));
  const frisch = (p) => Date.now() - zeit(p) < 24 * 3600000;
  for (let i = 0; i < 2 && i < ps.length; i++) {
    if (frisch(ps[i])) continue;
    const j = ps.findIndex((p, k) => k > i && frisch(p));
    if (j > i) ps.splice(i, 0, ps.splice(j, 1)[0]);
  }
  return ps;
}
// Im 2×2 nur eine Kachel je Geschichte: Beiträge, die zu einem ausgewählten gehören, stehen rechts unter „Auch berichtet von“
function kibHaupt(t) { return kibReihe(t).filter((p) => !KIB.zu[p.id]); }
const KIB_STOP = new Set(['nicht', 'werden', 'wurde', 'worden', 'einen', 'einer', 'eines', 'diese', 'dieser', 'dieses', 'haben', 'schon', 'sowie', 'unter', 'gegen', 'durch', 'heute', 'immer', 'seine', 'ihren', 'beim', 'nach', 'dass', 'sich', 'wird', 'sind', 'auch', 'oder', 'aber', 'wenn', 'noch', 'über', 'eine', 'mehr', 'with', 'from', 'that', 'this', 'have',
  'der', 'die', 'das', 'und', 'für', 'mit', 'von', 'den', 'dem', 'des', 'ein', 'ist', 'auf', 'aus', 'bei', 'zum', 'zur', 'vor', 'hat', 'sie', 'wie', 'was', 'wer',
  'als', 'bis', 'nur', 'man', 'uns', 'wir', 'ich', 'ihr', 'soll', 'will', 'the', 'and', 'for', 'are', 'was', 'its', 'not', 'but', 'all', 'has', 'new', 'how', 'who']);
function kibWoerter(p) {
  return new Set(((p.title || '') + ' ' + ((p.card && p.card.title) || '') + ' ' + String(p.text || '').slice(0, 300)).toLowerCase().replace(/https?:\/\/\S+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u).filter((w) => (w.length >= 3 || /^\d{2,}$/.test(w)) && !KIB_STOP.has(w)));
}
// Gleiche Geschichte → eine Kachel. Grundlage: was die KI in „auch“ nennt; dazu Beiträge desselben Themas
// (ausgewählt oder nicht), die mehrere Wörter teilen, die im Thema vorkommen, außerhalb aber selten sind
// (z. B. „phobos“, „jaxa“, „mmx“, „42“). Zu einem Thema gehört nur, was die KI ihm zugeordnet hat.
function kibGruppieren() {
  const r = S.ai.res; KIB.zu = {}; KIB.auch = {};
  const gewaehlt = new Set((r.auswahl || []).map((a) => a.id));
  const wort = new Map(); const df = new Map();
  S.posts.forEach((p) => { const w = kibWoerter(p); wort.set(p.id, w); w.forEach((x) => df.set(x, (df.get(x) || 0) + 1)); });
  const woerter = (id) => wort.get(id) || kibWoerter(S.byId[id]);
  const selten = Math.max(2, Math.round(S.posts.length * 0.005));
  (r.lage || []).forEach((t, i) => {
    const ids = [...new Set(t.ids || [])].filter((id) => S.byId[id] && S.aiTheme[id] === i);
    // „auch“ der KI: zählt auch für Beiträge ohne eigenes Thema
    (r.auswahl || []).forEach((a) => { if (ids.includes(a.id)) (a.auch || []).forEach((id) => { if (S.byId[id] && S.aiTheme[id] == null && !ids.includes(id)) ids.push(id); }); });
    const eltern = {}; ids.forEach((id) => { eltern[id] = id; });
    const wurzel = (id) => { while (eltern[id] !== id) id = eltern[id] = eltern[eltern[id]]; return id; };
    const binde = (a, b) => { if (eltern[a] != null && eltern[b] != null) eltern[wurzel(a)] = wurzel(b); };
    (r.auswahl || []).forEach((a) => { if (eltern[a.id] != null) (a.auch || []).forEach((id) => binde(id, a.id)); });
    const imThema = new Map(); ids.forEach((id) => woerter(id).forEach((x) => imThema.set(x, (imThema.get(x) || 0) + 1)));
    const istSelten = (x) => (df.get(x) || 0) - (imThema.get(x) || 0) <= selten;
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const A = woerter(ids[a]); const B = woerter(ids[b]);
        let geteilt = 0; let rar = 0;
        A.forEach((x) => { if (B.has(x)) { geteilt++; if (istSelten(x)) rar++; } });
        const d = A.size + B.size ? (2 * geteilt) / (A.size + B.size) : 0;
        const gleicheQuelle = S.byId[ids[a]].whoKey === S.byId[ids[b]].whoKey;
        // Themenwörter allein reichen nicht: erst drei seltene gemeinsame Wörter (oder zwei bei derselben Quelle) oder fast gleicher Text
        if (rar >= 3 || (rar >= 2 && gleicheQuelle) || d >= 0.5) binde(ids[a], ids[b]);
      }
    }
    // Je Gruppe ein Hauptbeitrag: ausgewählt, Gewicht, mit Bild, neuer
    const gruppen = {}; ids.forEach((id) => { (gruppen[wurzel(id)] = gruppen[wurzel(id)] || []).push(id); });
    Object.values(gruppen).forEach((g) => {
      if (g.length < 2) return;
      const wert = (id) => [gewaehlt.has(id) ? 1 : 0, KIB.gewicht[id] || 0, kibBild(S.byId[id]) ? 1 : 0, Date.parse(S.byId[id].date) || 0];
      g.sort((x, y) => { const a = wert(x); const b = wert(y); for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return b[k] - a[k]; return 0; });
      KIB.auch[g[0]] = g.slice(1);
      g.slice(1).forEach((id) => { KIB.zu[id] = g[0]; });
    });
  });
}
function kibPos(l, id) { const i = l.indexOf(id); return i >= 0 ? i : l.indexOf(KIB.zu[id]); }
function kibThemen() {
  const r = S.ai.res;
  return (r.lage || []).map((t, i) => ({ t, i, ps: kibReihe(t) })).filter((x) => x.ps.length);
}
function kibCreator(ps, size) {
  const da = new Set(); const es = [];
  ps.forEach((p) => { if (da.has(p.whoKey)) return; da.add(p.whoKey); es.push(Object.assign({ key: p.whoKey, avatar: p.avatar }, S.entries[p.whoKey] || {}, { name: entryNameOf(p) })); });
  return h('span', { class: 'kib-creator', 'aria-hidden': 'true' }, es.slice(0, 5).map((e) => avatar(e, size)), es.length > 5 ? h('span', { class: 'kib-plus' }, '+' + (es.length - 5)) : null);
}
// Squarified Treemap: Flächen proportional zu den Werten, Kacheln möglichst quadratisch
function kibKacheln(werte, W, H) {
  const sum = werte.reduce((s, v) => s + v, 0) || 1;
  const rest = werte.map((v, i) => ({ i, a: (v * W * H) / sum }));
  const out = []; let x = 0; let y = 0; let w = W; let hh = H; let row = [];
  const schlecht = (rw, seite) => {
    const s = rw.reduce((t, r) => t + r.a, 0); let mx = 0;
    rw.forEach((r) => { mx = Math.max(mx, (seite * seite * r.a) / (s * s), (s * s) / (seite * seite * r.a)); });
    return mx;
  };
  const legen = (rw) => {
    const s = rw.reduce((t, r) => t + r.a, 0);
    if (w >= hh) { const b = s / hh; let yy = y; rw.forEach((r) => { out[r.i] = { x, y: yy, w: b, h: r.a / b }; yy += r.a / b; }); x += b; w -= b; }
    else { const b = s / w; let xx = x; rw.forEach((r) => { out[r.i] = { x: xx, y, w: r.a / b, h: b }; xx += r.a / b; }); y += b; hh -= b; }
  };
  while (rest.length) {
    const seite = Math.min(w, hh);
    if (!row.length || schlecht(row.concat([rest[0]]), seite) <= schlecht(row, seite)) row.push(rest.shift());
    else { legen(row); row = []; }
  }
  if (row.length) legen(row);
  return out;
}
// Thema mit nur einer Karte: gleich in den Beitrag (ein Klick weniger); Esc führt dann direkt zum Mosaik
function kibOeffneThema(i) {
  const ps = S.ai.res && S.ai.res.lage[i] ? kibHaupt(S.ai.res.lage[i]) : [];
  if (ps.length === 1) { kibOeffnePost(i, ps, ps[0].id); return; }
  KIB.fokus = null; show(themaId(i), 'up');
}
function kibOeffnePost(i, ps, id) { KIB.thema = i; KIB.liste = ps.map((p) => p.id); KIB.fokus = 'post:' + id; show(id, 'up'); }
function kibListe() {
  const c = cur(); if (!c) return [];
  if (kibPos(KIB.liste, c.id) >= 0) return KIB.liste;
  const ti = S.aiTheme[c.id];
  if (ti != null && S.ai.res.lage[ti]) { KIB.thema = ti; KIB.liste = kibHaupt(S.ai.res.lage[ti]).map((p) => p.id); return KIB.liste; }
  KIB.thema = -1; KIB.liste = [c.id]; return KIB.liste;
}
// Am Themenende in zwei Stufen (kleiner Widerstand): 1. ↓ zeigt, was kommt, 2. ↓ geht weiter –
// ins nächste Thema oder, nach dem letzten, in eine weitere Runde der KI-Auswahl (höchstens KIB_RUNDEN)
const KIB_RUNDEN = 3;
function kibSchritt(d) {
  const l = kibListe(); const i = kibPos(l, (cur() || {}).id); const j = i + d;
  if (j >= 0 && j < l.length) { KIB.weiter = null; KIB.fokus = 'post:' + l[j]; show(l[j], d > 0 ? 'up' : 'down'); return; }
  if (d < 0) { flash(tt('Das ist der erste Beitrag des Themas.')); return; }
  if (KIB.thema < 0) { flash(tt('Ende des Themas – Esc führt zurück.')); return; }
  const th = kibThemen(); const pos = th.findIndex((x) => x.i === KIB.thema);
  const naechstes = pos >= 0 && pos + 1 < th.length ? th[pos + 1] : null;
  const id = (cur() || {}).id; const w = KIB.weiter; const jetzt = Date.now();
  if (!w || w.id !== id || jetzt > w.bis) {
    KIB.weiter = { id, seit: jetzt, bis: jetzt + 10000 };
    flash(naechstes ? tt('↓ Weiter: nächstes Thema „') + naechstes.t.thema + '“'
      : kibRundenEnde() ? tt('Das war die KI-Auswahl für jetzt. Esc führt zum Mosaik, „Neu kuratieren“ beginnt frisch.')
      : tt('↓ Weiter: mehr aus deinen Quellen'));
    if (!naechstes) kibVorladen();
    return;
  }
  if (jetzt - w.seit < 700) return;  // ein langer Wisch zählt als ein Schritt
  KIB.weiter = null;
  if (naechstes) { const ps = kibHaupt(naechstes.t); kibOeffnePost(naechstes.i, ps, ps[0].id); return; }
  kibMehr();
}
function kibRundenEnde() { return !S.ai.res || (S.ai.res.runde || 1) >= KIB_RUNDEN || !!KIB.nachLeer; }
function kibSchonAusgewaehlt() {
  const r = S.ai.res; const s = new Set();
  (r.auswahl || []).forEach((a) => s.add(a.id));
  (r.lage || []).forEach((x) => (x.ids || []).forEach((id) => s.add(id)));
  Object.keys(KIB.zu || {}).forEach((id) => s.add(id));
  return s;
}
// Weitere Runde: erst 48 h (mit Wunsch 96 h), dann weiter zurück, dann Älteres der Lieblingsquellen (Mastodon/Bluesky)
async function kibNachlegen() {
  const wunsch = !!String(settings.aiWunsch || '').trim();
  for (const stunden of wunsch ? [96, 168] : [48, 96]) { const e = await curate({ stunden }); if (e !== 'leer') return e; }
  const keys = Object.keys(S.favs).filter((k) => kannMehr(k)).slice(0, 6);
  let n = 0; for (const k of keys) n += await mehrLaden(k).catch(() => 0);
  return n ? curate({ stunden: 336 }) : 'leer';
}
function kibStarteNach() {
  if (!KIB.nach) {
    const nach = { warten: false };
    KIB.nach = nach;
    kibNachlegen().catch(() => 'fehler').then((e) => { KIB.nach = null; if (e === 'leer') KIB.nachLeer = true; kibNachFertig(e, nach.warten); });
  }
  return KIB.nach;
}
// Im letzten Thema schon im Hintergrund – nur mit eigener KI (die KOMPASS-Probe hat ein knappes Kontingent)
function kibVorladen() {
  if (KIB.nach || kibRundenEnde() || S.ai.busy || !aiActive() || !(KI.art() !== 'kompass' && KI.bereit())) return;
  kibStarteNach();
}
function kibVorPruefen(ti) { const th = kibThemen(); if (th.length && th[th.length - 1].i === ti) kibVorladen(); }
function kibMehr() {
  if (kibRundenEnde()) { flash(tt('Das war die KI-Auswahl für jetzt. Esc führt zum Mosaik, „Neu kuratieren“ beginnt frisch.')); return; }
  kibStarteNach().warten = true;
  flash(tt('Die KI liest weiter …'));
}
function kibNachFertig(e, warten) {
  if (!aiActive() || !S.ai.res) return;
  if (e === 'ok') {
    const neu = kibThemen().find((x) => x.t.runde === S.ai.res.runde);
    if (warten && neu && kibEbene() === 'karte') { const ps = kibHaupt(neu.t); kibOeffnePost(neu.i, ps, ps[0].id); flash(tt('Weitere Themen aus deinen Quellen')); return; }
    if (kibEbene() !== 'karte') render();
    return;
  }
  if (warten) flash(e === 'leer' ? tt('Mehr gibt es gerade nicht in deinen Quellen. Neue findest du unter „Quelle hinzufügen“.')
    : tt('Die KI-Auswahl hat gerade nicht geklappt.') + (KIB.nachFehler ? ' ' + KIB.nachFehler : ''));
}
function kibZurueck() {
  const e = kibEbene();
  if (e === 'karte') {
    const c = cur(); kibListe();
    const ti = KIB.thema;
    if (ti >= 0 && KIB.liste.length === 1) kibZumMosaik(ti);
    else if (ti >= 0) { const k = kibPos(KIB.liste, c.id); kibZeigeZeile(ti, Math.floor(k / 2)); KIB.fokus = 'post:' + (KIB.liste[k] || c.id); show(themaId(ti), 'down'); }
    else { KIB.fokus = null; show(lageId(), 'down'); }
  } else if (e === 'thema') { KIB.fokus = 'thema:' + themaIndex(cur().id); show(lageId(), 'down'); }
}
function kibZeigeZeile(ti, row) {
  const z = KIB.zeile[ti] || 0;
  if (row < z) KIB.zeile[ti] = row; else if (row > z + 1) KIB.zeile[ti] = row - 1;
}

/* Kopfzeile im KI-Modus (Laptop): ersetzt die linke Seitenspalte */
function kibKopf() {
  const r = S.ai.res;
  const tm = new Date(r.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const st = S.ai.busy ? tt('Die KI liest deine ungelesenen Beiträge …') : S.ai.err ? S.ai.err
    : tt('Stand ') + tm + ' · ' + r.auswahl.length + ' von ' + r.n + tt(' Beiträgen aus ') + r.quellen + tt(' Quellen · ') + (r.von || 'Mistral');
  return h('div', { class: 'kib-kopfzeile' + (S.ai.err ? ' err' : '') },
    h('div', { class: 'kib-kopf-reihe' },
      h('span', { class: 'kib-marke' }, zentraleMarke()),
      h('div', { class: 'kib-umschalter', role: 'group', 'aria-label': tt('Ansicht') },
        h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => setAiMode(false) }, tt('Chronologisch')),
        h('button', { type: 'button', 'aria-pressed': 'true' }, h('span', { 'aria-hidden': 'true' }, '✦ '), 'KI-Auswahl')),
      h('span', { class: 'kib-stand', role: 'status' }, st),
      h('button', { type: 'button', class: 'kib-knopf', 'aria-expanded': S.ai.wunschOpen ? 'true' : 'false', disabled: S.ai.busy, onClick: () => { S.ai.wunschOpen = !S.ai.wunschOpen; render(); } }, tt('Wunsch')),
      h('button', { type: 'button', class: 'kib-knopf', disabled: S.ai.busy, onClick: curate }, S.ai.busy ? tt('Kuratiere …') : tt('Neu kuratieren')),
      h('button', { type: 'button', class: 'kib-knopf rund', 'aria-label': tt('Einstellungen'), title: tt('Einstellungen'), onClick: () => { S.screen = 'settings'; render(); } }, icon('settings', { sm: true }))),
    S.ai.wunschOpen ? h('div', { class: 'ai-wunsch' },
      h('label', { for: 'k-wunsch', class: 'sr' }, tt('Was soll die KI beachten?')),
      h('input', { id: 'k-wunsch', value: S.ai.wunschDraft != null ? S.ai.wunschDraft : (settings.aiWunsch || ''), placeholder: tt('Was soll die KI beachten? z. B. mehr Raumfahrt, weniger Fußball'),
        autocomplete: 'off', onInput: (e) => { S.ai.wunschDraft = e.target.value; }, onKeydown: (e) => { if (e.key === 'Enter') saveWunsch(); } }),
      h('button', { type: 'button', class: 'kib-knopf primaer', onClick: saveWunsch }, tt('Übernehmen'))) : null);
}

/* Ebene 1: Mosaik */
function kibMosaik() {
  const r = S.ai.res; const th = kibThemen();
  const datum = new Date(r.at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const kopf = h('div', { class: 'kib-titel' },
    h('h1', {}, r.ueberschrift || tt('Heute in deinen Quellen')),
    h('span', { class: 'kib-datum' }, datum + ' · ' + th.length + (th.length === 1 ? tt(' Thema') : tt(' Themen'))),
    h('button', { type: 'button', class: 'kib-knopf', 'aria-pressed': KIB.alsListe ? 'true' : 'false', onClick: () => { KIB.alsListe = !KIB.alsListe; kibZeichnen(els.stage); } }, KIB.alsListe ? tt('Als Mosaik') : tt('Als Liste')));
  const hinweis = r.hinweis || (r.wunsch && r.treffer === 0) ? h('div', { class: 'kib-hinweis' },
    h('span', {}, r.hinweis || tt('Zu deinem Wunsch finde ich nichts in deinen Quellen.')),
    h('button', { type: 'button', class: 'kib-knopf', onClick: () => openAdd('ki', r.wunsch) }, tt('✦ KI nach passenden Quellen fragen'))) : null;
  if (!th.length) return h('div', { class: 'kib kib-mosaik' }, kopf, hinweis, h('p', { class: 'kib-leer' }, tt('Die KI hat keine Themen erkannt. „Neu kuratieren“ versucht es noch einmal.')));
  if (KIB.alsListe) return h('div', { class: 'kib kib-mosaik' }, kopf, hinweis, kibAlsListe(th));
  const flaeche = h('section', { class: 'kib-flaeche', 'aria-label': tt('Themen des Tages') });
  const root = h('div', { class: 'kib kib-mosaik' }, kopf, hinweis, flaeche);
  root._legen = () => {
    const W = flaeche.clientWidth; const H = flaeche.clientHeight; if (W < 50 || H < 50) return;
    const werte = th.map((x) => x.ps.length).concat([Math.max(1, Math.min(...th.map((x) => x.ps.length)) * 0.8)]);
    // Fläche um einen Abstand größer rechnen, jede Kachel um den Abstand kleiner: innen 4 px Fuge, außen bündig
    const rs = kibKacheln(werte, W + KIB_ABSTAND / 2, H + KIB_ABSTAND / 2);
    flaeche.replaceChildren(...th.map((x, k) => kibKachel(x, rs[k])), kibNeuesKachel(rs[th.length]));
  };
  return root;
}
function kibLage(rc) {
  const f = KIB_ABSTAND / 2;
  return 'left:' + rc.x + 'px;top:' + rc.y + 'px;width:' + Math.max(0, rc.w - f) + 'px;height:' + Math.max(0, rc.h - f) + 'px;';
}
function kibKachel(x, rc) {
  const { t, i, ps } = x;
  // Leitbild: der Leitbeitrag der KI, wenn er ein Bild hat, sonst der erste Beitrag mit Bild
  const leit = ps.find((p) => p.id === t.leit && kibBild(p)) || ps.find((p) => kibBild(p));
  const art = rc.w >= 320 && rc.h >= 250 && leit ? 'gross' : rc.w >= 190 && rc.h >= 150 ? 'mittel' : 'klein';
  const alle = ps.every(kibGesehen);
  const zahl = ps.length + (ps.length === 1 ? tt(' Beitrag') : tt(' Beiträge'));
  const label = t.thema + ', ' + zahl + (alle ? ', gelesen' : '') + '. ' + t.satz;
  const kids = art === 'gross' ? [
    h('img', { class: 'kib-bild', src: kibBild(leit), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('span', { class: 'kib-zahl' }, zahl),
    h('span', { class: 'kib-leit' }, tt('Leitbild · ') + entryNameOf(leit)),
    h('span', { class: 'kib-feld' }, h('span', { class: 'kib-name' }, t.thema), h('span', { class: 'kib-satz' }, t.satz), kibCreator(ps, 28))
  ] : art === 'mittel' ? [
    h('span', { class: 'kib-zahl2' }, zahl), h('span', { class: 'kib-name' }, t.thema), h('span', { class: 'kib-satz' }, t.satz), h('span', { class: 'kib-luft' }), kibCreator(ps, 26)
  ] : [h('span', { class: 'kib-zahl2' }, zahl), h('span', { class: 'kib-name' }, t.thema)];
  if (alle) kids.push(h('span', { class: 'kib-gelesen', 'aria-hidden': 'true' }, tt('✓ gelesen')));
  return h('button', { type: 'button', class: 'kib-kachel ' + art + (alle ? ' alle' : ''), 'data-nav': '', 'data-fokus': 'thema:' + i, 'aria-label': label,
    style: kibLage(rc) + '--kib-farbe:' + kibFarbe(i), onClick: () => kibOeffneThema(i) }, kids);
}
function kibNeuesKachel(rc) {
  return h('button', { type: 'button', class: 'kib-kachel neues', 'data-nav': '', 'data-fokus': 'neues', style: kibLage(rc), 'aria-label': tt('Neues außerhalb deiner Quellen entdecken'), onClick: discover },
    h('span', { class: 'kib-frage', 'aria-hidden': 'true' }, '?'), h('span', { class: 'kib-name' }, tt('Neues')), h('span', { class: 'kib-satz' }, tt('außerhalb deiner Quellen')));
}
// Alternative zur Grafik: Themen und Beiträge als Liste
function kibAlsListe(th) {
  return h('div', { class: 'kib-liste' }, th.map(({ t, i, ps }) => h('section', { class: 'kib-liste-thema', style: '--kib-farbe:' + kibFarbe(i) },
    h('button', { type: 'button', class: 'kib-liste-kopf', 'data-nav': '', 'data-fokus': 'thema:' + i, onClick: () => kibOeffneThema(i) },
      h('h2', {}, t.thema), h('span', {}, t.satz), h('span', { class: 'kib-datum' }, ps.length + (ps.length === 1 ? tt(' Beitrag') : tt(' Beiträge')))),
    h('ul', {}, ps.map((p) => h('li', {}, h('button', { type: 'button', 'data-nav': '', 'data-fokus': 'post:' + p.id, onClick: () => kibOeffnePost(i, ps, p.id) },
      h('span', { class: 'kib-datum' }, entryNameOf(p) + ' · ' + ago(p.date) + (kibGesehen(p) ? tt(' · ✓ gelesen') : '')), h('span', {}, p.title || String(p.text || '').slice(0, 140)))))))));
}

/* Ebene 2: Thema als 2×2, blättert zeilenweise */
// Kleines Mosaik (aktuelles Thema hervorgehoben) – Klick führt zum Mosaik
function kibMini(i, label, onClick) {
  const th = kibThemen();
  const mini = h('button', { type: 'button', class: 'kib-mini', 'aria-label': label, title: label, onClick });
  const rs = kibKacheln(th.map((x) => x.ps.length), 52, 32);
  th.forEach((x, k) => mini.appendChild(h('span', { class: x.i === i ? 'an' : '', style: 'left:' + rs[k].x + 'px;top:' + rs[k].y + 'px;width:' + Math.max(1, rs[k].w - 2) + 'px;height:' + Math.max(1, rs[k].h - 2) + 'px;--kib-farbe:' + kibFarbe(x.i) })));
  return mini;
}
function kibZumMosaik(ti) { KIB.fokus = ti >= 0 ? 'thema:' + ti : null; show(lageId(), 'down'); }
function kibThema(i) {
  kibVorPruefen(i);
  const r = S.ai.res; const t = r.lage[i]; const ps = kibHaupt(t);
  const th = kibThemen(); const pos = th.findIndex((x) => x.i === i);
  const naechstes = th.length > 1 ? th[(pos + 1) % th.length] : null;
  const alle = kibReihe(t); const quellen = new Set(alle.map(entryNameOf)).size;
  const mini = kibMini(i, tt('Zurück zum Mosaik (Esc)'), kibZurueck);
  // Kopf in einer Zeile – der Platz gehört den Bildern
  const kopf = h('div', { class: 'kib-themakopf', title: tt('↑ ↓ blättern · Enter öffnet · Esc zurück') }, mini,
    h('h1', {}, t.thema),
    h('p', { title: t.satz }, t.satz),
    h('span', { class: 'kib-datum' }, alle.length + (alle.length === 1 ? tt(' Beitrag · ') : tt(' Beiträge · ')) + quellen + (quellen === 1 ? tt(' Quelle') : tt(' Quellen'))),
    naechstes ? h('button', { type: 'button', class: 'kib-knopf klein', title: tt('Nächstes Thema: ') + naechstes.t.thema, 'aria-label': tt('Nächstes Thema: ') + naechstes.t.thema, onClick: () => kibOeffneThema(naechstes.i) }, tt('Nächstes Thema →')) : null);
  const zellen = ps.map((p) => kibPostKachel(i, ps, p));
  if (ps.length % 2) zellen.push(kibEndeKachel(naechstes));
  const spur = h('div', { class: 'kib-spur' }, zellen);
  const oben = h('button', { type: 'button', class: 'kib-mehr oben', tabindex: '-1', onClick: () => kibBlaettern(-1) });
  const unten = h('button', { type: 'button', class: 'kib-mehr unten', tabindex: '-1', onClick: () => kibBlaettern(1) });
  const fenster = h('div', { class: 'kib-fenster', role: 'region', 'aria-label': tt('Beiträge zum Thema ') + t.thema }, spur, oben, unten);
  const root = h('div', { class: 'kib kib-thema', style: '--kib-farbe:' + kibFarbe(i) }, kopf, fenster);
  KIB.dom = { i, spur, oben, unten, fenster, n: ps.length, zeilen: Math.ceil(zellen.length / 2), naechstes };
  root._legen = () => kibSpur(false);
  return root;
}
function kibPostKachel(i, ps, p) {
  const bild = kibBildGruppe(p); const ges = kibGesehen(p); const auch = (KIB.auch[p.id] || []).length;
  const e = Object.assign({ key: p.whoKey, avatar: p.avatar }, S.entries[p.whoKey] || {}, { name: entryNameOf(p) });
  const titel = p.title || String(p.text || '').replace(/\s+/g, ' ').slice(0, 200);
  return h('button', { type: 'button', class: 'kib-post' + (bild ? ' mit-bild' : '') + (ges ? ' gesehen' : ''), 'data-nav': '', 'data-fokus': 'post:' + p.id,
    'aria-label': entryNameOf(p) + ', ' + ago(p.date) + (ges ? ', gelesen' : '') + (kibVideo(p) ? tt(', Video') : '') + (auch ? ', auch bei ' + auch + (auch === 1 ? tt(' weiteren Quelle') : tt(' weiteren Quellen')) : '') + ': ' + titel,
    onClick: () => kibOeffnePost(i, ps, p.id), onFocus: () => { const k = ps.indexOf(p); kibZeigeZeile(i, Math.floor(k / 2)); kibSpur(true); } },
    bild ? h('img', { class: 'kib-bild', src: bild, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    h('span', { class: 'kib-marken', 'aria-hidden': 'true' }, kibVideo(p) ? h('span', { class: 'kib-play' }, '▶') : null, auch ? h('span', { class: 'kib-auch' }, '+' + auch + (auch === 1 ? tt(' Quelle') : tt(' Quellen'))) : null, ges ? h('span', { class: 'kib-gelesen2' }, tt('✓ gelesen')) : null),
    h('span', { class: 'kib-feld' },
      h('span', { class: 'kib-quelle' }, avatar(e, 20), h('span', {}, entryNameOf(p) + ' · ' + ago(p.date))),
      h('span', { class: 'kib-posttitel' }, titel),
      S.aiWhy[p.id] ? h('span', { class: 'kib-warum' }, '✦ ' + S.aiWhy[p.id]) : null));
}
function kibEndeKachel(naechstes) {
  return h('div', { class: 'kib-ende' }, h('b', {}, tt('Ende des Themas')),
    h('button', { type: 'button', class: 'kib-knopf', 'data-nav': '', 'data-fokus': 'ende', onClick: kibZurueck }, tt('Zurück zum Mosaik')),
    naechstes ? h('button', { type: 'button', class: 'kib-knopf primaer', onClick: () => kibOeffneThema(naechstes.i) }, tt('Nächstes Thema →')) : null);
}
function kibSpur(sanft) {
  const d = KIB.dom; if (!d || !d.fenster.isConnected) return;
  // Andeutung nur, wo es weitergeht: oben ganz, wenn unten nichts mehr kommt; in der Mitte halb und halb
  const H = d.fenster.clientHeight; const zh = Math.max(110, (H - KIB_RAND - KIB_ABSTAND) / 2);
  const maxZ = Math.max(0, d.zeilen - 2);
  const z = KIB.zeile[d.i] = Math.max(0, Math.min(maxZ, KIB.zeile[d.i] || 0));
  const vorher = z * 2; const nachher = Math.max(0, d.n - (z + 2) * 2);
  const versatz = !z ? 0 : z < maxZ ? KIB_RAND / 2 : KIB_RAND;
  d.spur.style.setProperty('--kib-zh', zh + 'px');
  d.spur.classList.toggle('sanft', !!sanft);
  d.spur.style.transform = 'translateY(' + (versatz - z * (zh + KIB_ABSTAND)) + 'px)';
  const pille = (t) => h('span', { class: 'kib-pille' }, t);
  d.oben.hidden = !vorher; d.oben.replaceChildren(pille('▲ ' + vorher + ' weitere'));
  d.unten.disabled = !nachher;
  d.unten.replaceChildren(pille(nachher ? '▼ ' + nachher + ' weitere' : tt('Ende des Themas')));
  d.unten.hidden = !nachher && (d.n % 2 === 1 || d.zeilen <= 2); // Ende-Kachel oder alles sichtbar: kein Hinweis nötig
}
function kibBlaettern(dz) {
  const d = KIB.dom; if (!d) return;
  KIB.zeile[d.i] = (KIB.zeile[d.i] || 0) + dz; kibSpur(true);
  const fk = document.activeElement && document.activeElement.closest && document.activeElement.closest('.kib-post');
  if (fk) { const alle = [...d.spur.querySelectorAll('.kib-post')]; const k = alle.indexOf(fk) + dz * 2; if (alle[k]) alle[k].focus({ preventScroll: true }); }
}

/* Zeichnen */
function kibZeichnen(el) {
  const e = kibEbene();
  const neu = e !== KIB.ebene; KIB.ebene = e;
  el.querySelectorAll('.kib, .kib-leiste').forEach((x) => x.remove());
  if (e === 'karte') return;
  el.querySelectorAll('.card, .empty, .loading').forEach((x) => x.remove());
  const root = e === 'thema' ? kibThema(themaIndex(cur().id)) : kibMosaik();
  if (neu) root.classList.add('kib-rein');
  el.appendChild(root);
  if (root._legen) root._legen();
  kibFokus(el);
}
function kibFokus(el) {
  const a = document.activeElement;
  if (a && a !== document.body && !el.contains(a)) return; // nicht aus dem Chat oder der Kopfzeile reißen
  const ziel = (KIB.fokus && [...el.querySelectorAll('[data-fokus]')].find((x) => x.dataset.fokus === KIB.fokus)) || el.querySelector('[data-nav]');
  if (ziel) ziel.focus({ preventScroll: true });
}
function kibBuehne(el, animate) {
  if (!isWide()) { el.querySelectorAll('.kib, .kib-leiste').forEach((x) => x.remove()); MODI.social.buehne(el, animate); return; }
  if (!el._kibRad) { el._kibRad = true; el.addEventListener('wheel', kibRad, { passive: true }); }
  el.dataset.ebene = kibEbene();
  if (kibEbene() !== 'karte') { kibZeichnen(el); return; }
  KIB.ebene = 'karte';
  el.querySelectorAll('.kib').forEach((x) => x.remove());
  const l = kibListe(); const c = cur(); const k = kibPos(l, c.id);
  const ti = KIB.thema; const t = ti >= 0 ? S.ai.res.lage[ti] : null;
  if (ti >= 0) kibVorPruefen(ti);
  const leiste = h('div', { class: 'kib-leiste' },
    kibMini(ti, tt('Zum Mosaik'), () => kibZumMosaik(ti)),
    h('button', { type: 'button', class: 'kib-knopf', onClick: kibZurueck }, '← ' + (t && l.length > 1 ? t.thema : 'KI-Auswahl'), h('span', { class: 'kib-taste' }, tt('Esc'))),
    l.length > 1 ? h('span', { class: 'kib-datum' }, (k + 1) + ' von ' + l.length + tt(' · ↑ ↓ oder Leertaste: nächster Beitrag')) : null);
  const alt = el.querySelector('.kib-leiste'); if (alt) alt.replaceWith(leiste); else el.prepend(leiste);
  MODI.social.buehne(el, animate);
}
function kibVerlassen() {
  // Stand ein KI-Eintrag vorn, zeigt die Social-Bühne danach den nächsten Beitrag statt einer leeren Mitte
  if (kibStapelOhneKi() && !cur()) setTimeout(() => { if (!aiActive() && !cur()) next(true); }, 0);
  KIB.ebene = ''; KIB.dom = null;
  if (els.stage) { els.stage.querySelectorAll('.kib, .kib-leiste').forEach((x) => x.remove()); delete els.stage.dataset.ebene; }
}
// Pfeiltasten: zur nächsten Kachel in der Richtung (Mosaik, Liste)
function kibPfeil(el, dx, dy) {
  const alle = [...el.querySelectorAll('[data-nav]')]; if (!alle.length) return;
  const a = alle.includes(document.activeElement) ? document.activeElement : null;
  if (!a) { alle[0].focus({ preventScroll: true }); return; }
  const m = (x) => { const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const p = m(a); let best = null; let bw = Infinity;
  alle.forEach((x) => {
    if (x === a) return; const q = m(x); const vx = q.x - p.x; const vy = q.y - p.y;
    const vor = dx ? vx * dx : vy * dy; if (vor <= 4) return;
    const quer = dx ? Math.abs(vy) : Math.abs(vx); const w = vor + quer * 2;
    if (w < bw) { bw = w; best = x; }
  });
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest' }); }
}
// Haken taste(e): der Kern fragt nach seinen Prüfungen (Eingabefelder, Ebenen, Modifikatoren); true = erledigt
function kibTaste(e) {
  if (!kibAn() || !els.stage) return false;
  if (e.target && e.target.isContentEditable) return false;
  const eb = kibEbene(); const k = e.key; let ok = true;
  const aufKnopf = e.target && e.target.closest && e.target.closest('button, a');
  if (eb === 'karte') {
    if ((k === ' ' || k === 'Enter') && aufKnopf && !aufKnopf.closest('.kib-leiste')) return false;
    if (k === 'ArrowDown' || k === 'j' || (k === ' ' && !e.shiftKey)) kibSchritt(1);
    else if (k === 'ArrowUp' || k === 'k' || (k === ' ' && e.shiftKey)) kibSchritt(-1);
    else if (k === 'Escape' && !S.overview && !S.factOpen) kibZurueck();
    else ok = false;
  } else if (eb === 'thema') {
    const alle = KIB.dom ? [...KIB.dom.spur.querySelectorAll('[data-nav]')] : [];
    const j = alle.indexOf(document.activeElement);
    const geh = (d) => { const x = alle[j < 0 ? 0 : Math.max(0, Math.min(alle.length - 1, j + d))]; if (x) x.focus({ preventScroll: true }); };
    if (k === 'ArrowDown' || k === 'j') geh(2);
    else if (k === 'ArrowUp' || k === 'k') geh(-2);
    else if (k === 'ArrowRight') geh(1);
    else if (k === 'ArrowLeft') geh(-1);
    else if (k === ' ') kibBlaettern(e.shiftKey ? -1 : 1);
    else if (k === 'Escape') kibZurueck();
    else ok = false;
  } else {
    if (k === 'ArrowDown' || k === 'j') kibPfeil(els.stage, 0, 1);
    else if (k === 'ArrowUp' || k === 'k') kibPfeil(els.stage, 0, -1);
    else if (k === 'ArrowRight') kibPfeil(els.stage, 1, 0);
    else if (k === 'ArrowLeft') kibPfeil(els.stage, -1, 0);
    else if (k === ' ' && !aufKnopf) { /* Leertaste blättert im Mosaik nicht */ }
    else ok = false;
  }
  if (ok) e.preventDefault();
  return ok;
}
// Mausrad auf der KI-Bühne: blättert im Thema und in der Karte (der Kern ist über gesten: false still)
function kibRad(e) {
  if (!kibAn() || !els.stage || !els.stage.contains(e.target)) return;
  const eb = kibEbene();
  if (eb === 'mosaik') return;
  if (eb === 'karte') { const sc = e.target.closest('.card-body'); if (sc && sc.scrollHeight > sc.clientHeight + 2) return; }
  if (Math.abs(e.deltaY) < 30 || KIB.sperre) return;
  KIB.sperre = true; setTimeout(() => { KIB.sperre = false; }, 450);
  const d = e.deltaY > 0 ? 1 : -1;
  if (eb === 'karte') kibSchritt(d); else kibBlaettern(d);
}
let kibGroesse = 0;
if (window.ResizeObserver) new ResizeObserver(() => {
  clearTimeout(kibGroesse);
  kibGroesse = setTimeout(() => { if (kibAn() && els.stage && kibEbene() !== 'karte') kibZeichnen(els.stage); }, 120);
}).observe(document.documentElement);

// Rechts unten an der vollen Karte: bis zu drei weitere Beiträge derselben Geschichte
function kibAuchFeld(c) {
  if (!kibAn() || !c || kibEbene() !== 'karte') return null;
  const haupt = KIB.zu[c.id] || c.id;
  const ids = [haupt].concat(KIB.auch[haupt] || []).filter((id) => id !== c.id && S.byId[id]);
  if (!ids.length) return null;
  return h('section', { class: 'kib-auchfeld', 'aria-label': tt('Auch berichtet von') },
    h('div', { class: 'assist-head' }, h('b', {}, tt('Auch berichtet von')), ids.length > 3 ? h('span', { class: 'small' }, '3 von ' + ids.length) : null),
    ids.slice(0, 3).map((id) => {
      const p = S.byId[id]; const b = kibBild(p);
      const e = Object.assign({ key: p.whoKey, avatar: p.avatar }, S.entries[p.whoKey] || {}, { name: entryNameOf(p) });
      const titel = p.title || String(p.text || '').replace(/\s+/g, ' ').slice(0, 160);
      return h('button', { type: 'button', class: 'kib-auchkachel' + (kibGesehen(p) ? ' gesehen' : ''), 'aria-label': entryNameOf(p) + ', ' + ago(p.date) + ': ' + titel, onClick: () => show(id, 'up') },
        b ? h('img', { src: b, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'kib-auchbild', 'aria-hidden': 'true' }, avatar(e, 28)),
        h('span', { class: 'kib-auchtext' },
          h('span', { class: 'kib-quelle' }, b ? avatar(e, 16) : null, h('span', {}, entryNameOf(p) + ' · ' + ago(p.date))),
          h('span', { class: 'kib-auchtitel' }, titel)));
    }));
}
// Gegenstand des Chats rechts: Mosaik = Lage, Thema = Thema, volle Karte = der Beitrag (null)
function kibChatBezug() {
  if (!kibAn()) return null;
  const e = kibEbene(); if (e === 'karte') return null;
  const p = S.byId[e === 'thema' ? cur().id : lageId()]; if (!p) return null;
  return { art: e === 'thema' ? 'thema' : 'lage', titel: e === 'thema' ? p.title : (S.ai.res.ueberschrift || p.title), text: p.text, quelle: 'KI-Auswahl' };
}

/* ---------- Anmeldung am Kern (Modus-Schnittstelle, siehe kern/modi.js) ---------- */
modusRegistrieren({
  id: 'ki',
  label: 'KI-Auswahl',
  aktiv: aiActive,
  // Reihenfolge: Lage-Karte, dann die ausgewählten Beiträge; in der vollen Karte auf dem Laptop: die Beiträge des Themas
  reihenfolge(base) {
    if (kibAn() && kibEbene() === 'karte') {
      const l = kibListe(); const i = kibPos(l, cur().id);
      return l.slice(i + 1).concat(l.slice(0, i + 1)).map((id) => S.byId[id]).filter(Boolean);
    }
    const map = new Map(base.map((p) => [p.id, p]));
    const list = [];
    if (S.byId[lageId()]) list.push(S.byId[lageId()]);
    S.ai.res.auswahl.forEach((a) => { const p = map.get(a.id); if (p) list.push(p); });
    return list;
  },
  buehne: kibBuehne,
  verlassen: kibVerlassen,
  // Gerüst (nur Laptop): ohne Quellen-Spalte, Chat rechts fest offen, Tasten und Mausrad gehören den Ebenen
  seitenspalte: () => !kibAn(),
  rechts: () => (kibAn() ? { breite: 440, offen: true } : null),
  gesten: () => !kibAn(),
  taste: kibTaste,
  chatBezug: kibChatBezug,
  // Lage-Karte nur in der KI-Auswahl (Handy); im Social-Modus nie eine KI-Karte
  karte: (p) => {
    if (!p || p.service !== 'ki') return null;
    if (aiActive()) return lageCard(p);
    setTimeout(kibAufraeumen, 0);
    return h('div', { class: 'empty', 'aria-hidden': 'true' });
  },
  kartenZusatz: (p, ort) => aiNote(p, ort === 'oben' ? 'why' : 'also')
});
