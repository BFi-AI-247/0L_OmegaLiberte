// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Gerüst: Kopf- und Fußleisten (Handy), Seitenspalte (Laptop), Aktionen, Ebenen (Blätter, Toasts). Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- Oberfläche ------------------------------------------------- */
const app = document.getElementById('app');
const els = {};
let toastTimer = null;
function flash(t) { S.toast = t; renderLayer(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = ''; renderLayer(); }, 2600); }

function avatar(e, size, extra) {
  const el = h('span', { class: 'av' + (extra || ''), style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${String(e.key || e.whoKey || '').startsWith('radar') ? '#1F5F8B' : (e.key === 'youtube' ? '#B3261E' : tone(e.colorKey || e.key || e.whoKey || e.name || e.who))}` });
  if (e.avatar) {
    const img = h('img', { src: e.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.remove(); el.textContent = initial(e.name || e.who); });
    el.appendChild(img);
  } else el.textContent = e.service === 'radar' || (e.key || '').startsWith('radar') ? 'R' : initial(e.name || e.who);
  return el;
}

function presser(key, toggle) {
  let timer = null; let long = false;
  return {
    onPointerdown: () => { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; S.cfgKey = key; S.overview = false; render(); }, 550); },
    onPointerup: () => clearTimeout(timer), onPointerleave: () => clearTimeout(timer),
    // Rechtsklick (Laptop) bzw. Lang-Druck (Handy) öffnet die Einstellungen des Eintrags
    onContextmenu: (e) => { e.preventDefault(); clearTimeout(timer); long = true; S.cfgKey = key; S.overview = false; render(); },
    onClick: () => { clearTimeout(timer); if (long) { long = false; return; } select(key, toggle); }
  };
}

function toggleFav(k) {
  if (!S.favs[k]) S.favs[k] = true;
  else { delete S.favs[k]; ((S.entries[k] || {}).members || []).forEach((m) => { delete S.favs[m.key]; }); }
  save('favs'); render();
}
function segControl() {
  const segs = [['fav', tt('Favorit')], ['dienst', tt('Dienst')], ['kontakt', tt('Kontakt')], ['creator', tt('Creator')]];
  return h('div', { class: 'seg', role: 'group', 'aria-label': tt('Gruppierung') },
    segs.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': S.mode === k ? 'true' : 'false', onClick: () => { S.mode = k; S.filter = null; render(); } }, l)));
}
function countPill() {
  return h('button', { type: 'button', class: 'pill', 'aria-label': tt('Zählweise der ungelesenen Beiträge wechseln'), title: tt('Zählweise wechseln'), onClick: () => { S.countMode = (S.countMode + 1) % 3; render(); } },
    [tt('seit Öffnen'), tt('letzte 24 h'), tt('alle ungelesenen')][S.countMode]);
}
function entryRow(k, toggle) {
  const e = S.entries[k]; const n = unread(k); const fav = !!S.favs[k];
  return h('div', { class: 'row' + (S.filter === k ? ' sel' : '') },
    h('button', Object.assign({ type: 'button', class: 'row-main', 'aria-label': e.name + ', ' + n + tt(' ungelesen. Tippen zum Anzeigen, lang drücken oder Rechtsklick für Einstellungen') }, presser(k, toggle)),
      avatar(e, 36),
      h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, e.name),
        h('span', { class: 'row-sub' }, e.sub + (e.members ? '' : e.handle ? ' · ' + e.handle : '') + (cfgOf(k).show ? '' : tt(' · stumm')))),
      n > 0 ? h('span', { class: 'count' }, n > 50 ? '50+' : String(n)) : null),
    h('button', { type: 'button', class: 'star', 'aria-pressed': fav ? 'true' : 'false', 'aria-label': e.name + (fav ? tt(' als Favorit entfernen') : tt(' als Favorit markieren')),
      onClick: () => toggleFav(k) }, icon('star', { filled: fav })));
}
function dupeRow(s, focus) {
  const A = S.entries[s.a]; const B = S.entries[s.b]; if (!A || !B) return null;
  const other = focus === s.a ? B : focus === s.b ? A : null;
  const title = other ? other.name : A.name === B.name ? A.name : A.name + ' + ' + B.name;
  const svc = (SERVICE_LABEL[A.service] || A.service) + ' + ' + (SERVICE_LABEL[B.service] || B.service);
  const sub = (other ? other.handle + ' · ' + (SERVICE_LABEL[other.service] || other.service) : A.name === B.name ? svc : A.handle + ' + ' + B.handle + ' · ' + svc) + ' · ' + s.why;
  return h('div', { class: 'dupe' },
    other ? avatar(other, 28) : h('span', { class: 'dupe-avs' }, avatar(A, 24), avatar(B, 24)),
    h('span', { class: 'row-text' }, h('span', { class: 'dupe-title' }, title), h('span', { class: 'row-sub', title: sub }, sub)),
    h('span', { class: 'dupe-btns' },
      h('button', { type: 'button', class: 'mini primary', 'aria-label': tt('Zusammenführen: ') + title, onClick: () => decide([s.k], 'ja', tt('Zusammengeführt – ein Eintrag für beide Dienste.')) }, tt('Zusammen')),
      h('button', { type: 'button', class: 'mini', 'aria-label': 'Nicht dieselbe Quelle: ' + title, onClick: () => decide([s.k], 'nein', tt('Bleibt getrennt.')) }, tt('Nein'))));
}
function suggestBox() {
  const list = suggestFor(S.mode); if (!list.length) return null;
  const n = list.length;
  return h('div', { class: 'dupes' },
    h('b', { class: 'dupes-head' }, tt('Doppelt? ') + n + (n === 1 ? tt(' mögliche Übereinstimmung') : tt(' mögliche Übereinstimmungen'))),
    h('span', { class: 'small' }, tt('Vermutlich derselbe Creator auf mehreren Wegen (Mastodon, Bluesky, YouTube, Website). Zusammengeführt erscheint er als ein Eintrag.')),
    list.slice(0, S.dupesAll ? n : 3).map((s) => dupeRow(s)),
    n > 3 && !S.dupesAll ? h('button', { type: 'button', class: 'mini', style: 'align-self:flex-start', onClick: () => { S.dupesAll = true; render(); } }, tt('Alle ') + n + ' zeigen') : null);
}

/* Handy: eine Kopfzeile – KI · Suche · aktuelle Quelle mit Aufklapper · Neu laden · Einstellungen */
function openOverview(focusSearch) {
  S.overview = focusSearch ? true : !S.overview; S.chatOpen = false; S.factOpen = false; render();
  if (focusSearch) setTimeout(() => { const el = document.getElementById('k-esearch'); if (el) el.focus(); }, 30);
}
function renderTop() {
  const hasDupes = suggestFor(S.mode).length > 0;
  const e = S.filter && S.entries[S.filter];
  const n = e ? unread(S.filter) : unreadAll();
  const label = e ? e.name : aiActive() ? 'KI-Auswahl' : tt('Alle Quellen');
  const chev = icon('down', { sm: true }); chev.style.transition = 'transform .2s'; chev.style.transform = S.overview ? 'rotate(180deg)' : '';
  const top = h('header', { class: 'top top-one' },
    h('div', { class: 'top-bar' },
      modusLeiste(false),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': tt('Quelle suchen'), title: tt('Suchen'), onClick: () => openOverview(true) }, icon('search')),
      h('button', { type: 'button', class: 'who-pick' + (hasDupes && !S.overview ? ' has-dot' : ''), 'aria-expanded': S.overview ? 'true' : 'false',
        'aria-label': tt('Quelle wählen, aktuell ') + label + (n ? ', ' + n + tt(' ungelesen') : ''), onClick: () => openOverview(false) },
        e ? avatar(e, 28) : h('span', { class: 'av all', style: 'width:28px;height:28px' }, aiActive() ? h('span', { class: 'ai-spark' }, '✦') : icon('all', { sm: true })),
        h('span', { class: 'who-pick-name' }, h('span', { class: 'who-pick-label' }, label), aiActive() || (S.ai.on && (S.ai.busy || S.ai.err)) ? h('small', { class: 'who-pick-sub' }, aiStatusShort()) : null),
        n > 0 ? h('span', { class: 'count' }, n > 50 ? '50+' : String(n)) : null,
        chev),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': tt('Neu laden'), title: tt('Neu laden'), onClick: loadAll }, icon('refresh')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': tt('Einstellungen'), title: tt('Einstellungen'), onClick: () => { S.screen = 'settings'; S.overview = false; render(); } }, icon('settings'))));
  if (S.overview) {
    const all = unreadAll();
    top.appendChild(h('div', { class: 'overview' },
      S.ai.on ? aiBand() : null,
      h('div', { class: 'overview-tools' }, segControl(), countPill()),
      h('div', { class: 'overview-search' }, entrySearch()),
      h('div', { class: 'overview-list' },
        S.eq ? null : h('div', { class: 'row' + (S.filter ? '' : ' sel') },
          h('button', { type: 'button', class: 'row-main', onClick: () => { S.overview = false; select(null); } },
            h('span', { class: 'av all' }, icon('all', { sm: true })),
            h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, tt('Alle Quellen')), h('span', { class: 'row-sub' }, tt('Gemischt, neueste zuerst'))),
            all > 0 ? h('span', { class: 'count' }, all > 50 ? '50+' : String(all)) : null)),
        S.eq ? null : h('div', { class: 'row' }, h('button', { type: 'button', class: 'row-main', onClick: () => openAdd(null, S.eq.trim()) },
          h('span', { class: 'av add-av' }, '+'), h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, tt('Quelle hinzufügen')), h('span', { class: 'row-sub' }, tt('Mastodon, Bluesky, YouTube, Websites'))))),
        h('div', { class: 'side-label small' }, S.eq ? tt('Suche in allen Gruppen') : OVERVIEW_TITLES[S.mode]),
        S.eq ? null : suggestBox(),
        (() => { const ks = viewKeys(); return ks.length ? ks.map((k) => entryRow(k, false)) : S.eq ? h('div', { class: 'add-msg', style: 'padding:16px;text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center' }, h('span', { class: 'small' }, tt('Keine deiner Quellen passt.')),
          h('button', { type: 'button', class: 'mini primary', onClick: () => openAdd(null, S.eq.trim()) }, '„' + S.eq.trim() + tt('“ als neue Quelle suchen'))) : emptyHint(); })()),
      h('div', { class: 'overview-foot' },
        h('button', { type: 'button', class: 'counters', 'aria-label': tt('Verlauf öffnen'), onClick: () => { S.screen = 'history'; S.overview = false; render(); } },
          h('span', {}, h('strong', {}, String(S.day.n)), tt(' heute')), h('span', {}, h('strong', {}, S.total.toLocaleString(LANG === 'de' ? 'de-DE' : 'en-US')), tt(' gesamt')), pauseZaehler()),
        h('button', { type: 'button', class: 'mini', onClick: () => { S.overview = false; discover(); } }, tt('? Neues entdecken')),
        h('span', { class: 'brand' }, zentraleMarke()))));
  }
  return top;
}
const OVERVIEW_TITLES = ttFest(() => ({ fav: tt('Deine Favoriten'), dienst: tt('Alle Dienste'), kontakt: tt('Alle Kontakte'), creator: tt('Alle Creator') }));
function emptyHint() {
  // #64: Text je Reiter – sind schon Quellen da, nicht „noch nichts verbunden“ sagen
  const da = settings.feeds.length || settings.mastodon || settings.bluesky || S.kfollows.length;
  const je = { fav: tt('Noch keine Favoriten. Wechsle zu Dienst, Kontakt oder Creator und markiere Einträge mit dem Stern.'),
    dienst: tt('Noch keine Dienste – Mastodon, Bluesky, YouTube oder Websites in den Einstellungen verbinden.'),
    kontakt: tt('Noch keine Kontakte – Kontakte sind Menschen, denen du auf Mastodon oder Bluesky folgst.'),
    creator: tt('Noch keine Creator – Creator sind YouTube-Kanäle, Websites und Personen, denen du folgst.') };
  return h('p', { class: 'small', style: 'padding:16px;text-align:center' }, S.loading ? tt('Lade Quellen …')
    : (modulAn('leerbild') && da && je[S.mode]) || (S.mode === 'fav' ? je.fav : tt('Noch nichts verbunden – Quellen in den Einstellungen hinzufügen.')));
}
function unreadAll() {
  const since = S.countMode === 0 ? S.prevOpen : S.countMode === 1 ? Date.now() - 86400000 : 0;
  return visible().filter((p) => p.service !== 'markt' && !S.seen[sk(p.id)] && (Date.parse(p.date) || 0) >= since).length;  // #24: Markt-Karte zählt nicht
}

/* Laptop: linke Spalte mit allen Einträgen, Mitte Beitrag, rechts Faktencheck + Dialog */
function renderSide() {
  const keys = keysFor(S.mode); const n = unreadAll();
  return [
    h('div', { class: 'side-head' }, h('span', { class: 'brand big' }, zentraleMarke()), countPill()),
    h('div', { class: 'side-ai' }, modusLeiste(true)),
    h('div', { class: 'side-seg' }, segControl(), entrySearch()),
    h('div', { class: 'side-list' },
      h('div', { class: 'row' + (S.filter ? '' : ' sel') },
        h('button', { type: 'button', class: 'row-main', onClick: () => select(null) },
          h('span', { class: 'av all' }, icon('all', { sm: true })),
          h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, tt('Alles')), h('span', { class: 'row-sub' }, tt('Alle Quellen gemischt, neueste zuerst'))),
          n > 0 ? h('span', { class: 'count' }, n > 50 ? '50+' : String(n)) : null)),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'row-main', onClick: () => openAdd(null, S.eq.trim()) },
        h('span', { class: 'av add-av' }, '+'), h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, tt('Quelle hinzufügen')), h('span', { class: 'row-sub' }, tt('Mastodon, Bluesky, YouTube, Websites'))))),
      h('div', { class: 'side-label small' }, S.eq ? tt('Suche in allen Gruppen') : OVERVIEW_TITLES[S.mode]),
      S.eq ? null : suggestBox(),
      (() => { const ks = viewKeys(); return ks.length ? ks.map((k) => entryRow(k, true)) : S.eq ? h('div', { class: 'add-msg', style: 'padding:16px;text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center' }, h('span', { class: 'small' }, tt('Keine deiner Quellen passt.')),
        h('button', { type: 'button', class: 'mini primary', onClick: () => openAdd(null, S.eq.trim()) }, '„' + S.eq.trim() + tt('“ als neue Quelle suchen'))) : emptyHint(); })()),
    h('div', { class: 'side-nav', role: 'group', 'aria-label': tt('Navigation'), title: KEYS_HINT }, navButtons()),
    h('div', { class: 'side-hint small' }, tt('Klick: anzeigen · Rechtsklick: einstellen'), h('br'), tt('Tasten: ↓↑ j k · s mischen · n Neues · m l f /')),
    renderFoot(true)
  ];
}
// Herz/Merken: Knöpfe in der Bühne (Kartenfuß) an Ort und Stelle angleichen – die Bühne wird dafür nicht neu gezeichnet (K003)
function syncActs(id) {
  document.querySelectorAll('.icon-btn.like[data-id], .icon-btn.mark[data-id]').forEach((b) => {
    if (b.dataset.id !== String(id)) return;
    const like = b.classList.contains('like'); const on = like ? !!S.liked[id] : !!S.marked[id];
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.replaceChildren(icon(like ? 'heart' : 'mark', { filled: on }));
  });
}
function toggleLike(id) { S.liked[id] = !S.liked[id]; if (!S.liked[id]) delete S.liked[id]; save('liked'); render(); syncActs(id); }
function toggleMark(id) {
  const m = !S.marked[id]; if (m) S.marked[id] = Date.now(); else delete S.marked[id];
  save('marked'); flash(m ? tt('Gemerkt – im Verlauf unter „Nur Gemerkte“') : tt('Nicht mehr gemerkt')); render(); syncActs(id);
}
function actButtons(c) {
  const id = c && c.id;
  return [
    h('button', { type: 'button', class: 'icon-btn like', 'data-id': id || null, 'aria-label': tt('Gefällt mir'), title: tt('Gefällt mir (l)'), 'aria-pressed': id && S.liked[id] ? 'true' : 'false', disabled: !id, onClick: () => toggleLike(id) }, icon('heart', { filled: id && S.liked[id] })),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': tt('Teilen'), title: tt('Teilen'), disabled: !id, onClick: () => sharePost(c) }, icon('share')),
    h('button', { type: 'button', class: 'icon-btn mark', 'data-id': id || null, 'aria-label': tt('Merken'), title: tt('Merken (m)'), 'aria-pressed': id && S.marked[id] ? 'true' : 'false', disabled: !id, onClick: () => toggleMark(id) }, icon('mark', { filled: id && S.marked[id] }))];
}
let KEYS_HINT = tt('Tasten: ↓ j Leertaste weiter · ↑ k zurück · s mischen · n Neues · m merken · l gefällt · f prüfen · / fragen');
beiSprachwechsel(() => { KEYS_HINT = tt('Tasten: ↓ j Leertaste weiter · ↑ k zurück · s mischen · n Neues · m merken · l gefällt · f prüfen · / fragen'); });
function navButtons() {
  return [
    h('button', { type: 'button', 'aria-label': tt('Zurück zum vorherigen Beitrag'), title: tt('Zurück (↑ / k)'), onClick: back }, icon('up')),
    h('button', { type: 'button', 'aria-label': tt('Nächster Beitrag'), title: tt('Weiter (↓ / j / Leertaste)'), onClick: () => next() }, icon('down')),
    h('button', { type: 'button', 'aria-label': tt('Mischen: Zufall aus deinem Kontext'), title: tt('Mischen (s)'), onClick: shuffle }, icon('shuffle')),
    h('button', { type: 'button', 'aria-label': tt('Neues: etwas, dem du noch nicht folgst'), title: tt('Neues (n)'), onClick: discover }, icon('question'))];
}
function renderActions(wide) {
  const c0 = cur(); const c = c0 && c0.service === 'ki' ? null : c0;
  const id = c && c.id;
  const chk = id ? S.checks[id] : null;
  const fact = FACT[chk && chk.state === 'done' ? chk.status : 'grau'];
  const like = h('button', { type: 'button', class: 'icon-btn like', 'aria-label': tt('Gefällt mir'), title: tt('Gefällt mir (l)'), 'aria-pressed': id && S.liked[id] ? 'true' : 'false', disabled: !id,
    onClick: () => toggleLike(id) }, icon('heart', { filled: id && S.liked[id] }));
  const share = h('button', { type: 'button', class: 'icon-btn', 'aria-label': tt('Teilen'), title: tt('Teilen'), disabled: !id, onClick: () => sharePost(c) }, icon('share'));
  const mark = h('button', { type: 'button', class: 'icon-btn mark', 'aria-label': tt('Merken'), title: tt('Merken (m)'), 'aria-pressed': id && S.marked[id] ? 'true' : 'false', disabled: !id,
    onClick: () => toggleMark(id) }, icon('mark', { filled: id && S.marked[id] }));
  const navs = [
    h('button', { type: 'button', 'aria-label': tt('Zurück zum vorherigen Beitrag'), title: tt('Zurück (↑ / k)'), onClick: back }, icon('up')),
    h('button', { type: 'button', 'aria-label': tt('Nächster Beitrag'), title: tt('Weiter (↓ / j / Leertaste)'), onClick: () => next() }, icon('down')),
    h('button', { type: 'button', 'aria-label': tt('Mischen: Zufall aus deinem Kontext'), title: tt('Mischen (s)'), onClick: shuffle }, icon('shuffle')),
    h('button', { type: 'button', 'aria-label': tt('Neues: etwas, dem du noch nicht folgst'), title: tt('Neues (n)'), onClick: discover }, icon('question'))];
  if (wide) {
    return h('section', { class: 'actions wide-actions', 'aria-label': tt('Aktionen und Navigation') },
      h('div', { class: 'act-row' }, like, share, mark, h('span', { class: 'spacer' }), h('div', { class: 'nav' }, navs)),
      h('div', { class: 'keys small' }, tt('Tasten: ↓ j Leertaste weiter · ↑ k zurück · s mischen · n Neues · m merken · l gefällt · f prüfen · / fragen')));
  }
  // Handy: eine Zeile – KI-Check-Blase (öffnet Faktencheck + Dialog), Gefällt, Teilen, Merken, hoch, runter, (Mischen)
  return h('nav', { class: 'bar-one', 'aria-label': tt('Aktionen und Navigation') },
    h('button', { type: 'button', class: 'ai-bubble' + (S.chatOpen ? ' on' : ''), 'aria-label': tt('KI-Check und Dialog – Faktencheck: ') + (chk && chk.state === 'run' ? tt('läuft') : fact.label), title: tt('KI-Check und Dialog'), disabled: !id,
      onClick: () => { S.chatOpen = !S.chatOpen; S.factOpen = false; S.overview = false; render(); } },
      icon('chat'), h('span', { class: 'dot', style: 'background:' + fact.color })),
    like, share, mark, navs[0], navs[1], h('span', { class: 'bar-shuffle' }, navs[2]));
}
async function sharePost(c) {
  if (!c) return;
  const data = { title: c.title || c.who, text: (c.title || c.text || '').slice(0, 140), url: c.link };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(c.link); flash(tt('Link kopiert.'));
  } catch (e) { /* abgebrochen */ }
}

function renderSuggest() {
  return h('div', { class: 'suggest scrollx' }, icon('chat', { sm: true }),
    ['Worum geht’s?', tt('Stimmt das?'), tt('Was sagt die Gegenseite?')].map((t) => h('button', { type: 'button', disabled: !cur(), onClick: () => chat(t) }, t)));
}

function renderFoot(wide) {
  return h('footer', { class: 'foot' },
    h('button', { type: 'button', class: 'counters', 'aria-label': tt('Verlauf öffnen'), onClick: () => { S.screen = 'history'; S.overview = false; render(); } },
      h('span', {}, h('strong', {}, String(S.day.n)), tt(' heute')), h('span', {}, h('strong', {}, S.total.toLocaleString(LANG === 'de' ? 'de-DE' : 'en-US')), tt(' gesamt')), pauseZaehler()),
    h('div', { class: 'foot-right' },
      h('button', { type: 'button', class: 'ghost', 'aria-label': tt('Neu laden'), title: tt('Neu laden'), onClick: loadAll }, icon('refresh')),
      h('button', { type: 'button', class: 'ghost', 'aria-label': tt('Einstellungen'), title: tt('Einstellungen'), onClick: () => { S.screen = 'settings'; S.overview = false; render(); } }, icon('settings')),
      wide ? null : h('span', { class: 'brand' }, zentraleMarke())));
}

function closeBtn(label, fn) { return h('button', { type: 'button', class: 'ghost', 'aria-label': label, onClick: fn }, icon('close')); }

// #62: Ebene neu zeichnen (z. B. durch flash() beim Hinzufügen aus dem Katalog) behält die Scrollposition von Listen
const EBENE_SCROLL = ['.add-list', '.add-sheet', '.screen-body', '.overview-list'];
function renderLayer() {
  const L = els.layer; const pos = EBENE_SCROLL.map((sel) => { const el = L.querySelector(sel); return [sel, el ? el.scrollTop : 0]; });
  renderLayerZeichnen();
  pos.forEach(([sel, y]) => { const el = y && L.querySelector(sel); if (el) el.scrollTop = y; });
}
function renderLayerZeichnen() {
  const L = els.layer; L.textContent = '';
  const c = cur();
  const wide = isWide();
  if (false) {
    const chk = S.checks[c.id];
    L.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('b', {}, tt('Faktencheck')), closeBtn(tt('Schließen'), () => { S.factOpen = false; render(); })),
      h('div', { class: 'small' }, tt('Kontakte: noch keine geteilten Prüfungen · Gemeinschaft: kommt mit der Sammelstelle im Backend')),
      chk && chk.state === 'run' ? h('div', { class: 'note' }, tt('Deine KI prüft …')) : null,
      chk && (chk.state === 'done' || chk.state === 'fehler') ? h('div', { class: 'note' }, chk.text + (chk.by ? '\n\n— ' + chk.by : '')) : null,
      h('button', { type: 'button', class: 'btn primary', onClick: factCheck }, chk && chk.state === 'done' ? tt('Erneut prüfen lassen') : tt('Meine KI prüfen lassen'))));
  }
  if (!wide && S.chatOpen && c && typeof einFenster === 'function' && einFenster()) {
    // #26: Handy – ein Chatfenster, eine Eingabe; Faktencheck als Frage, Ampel als Antwortkarte
    const input = h('input', { id: 'k-chat', placeholder: tt('Frag deinen Agenten …'), value: S.draft, autocomplete: 'off',
      onInput: (e) => { S.draft = e.target.value; }, onKeydown: (e) => { if (e.key === 'Enter') chat(S.draft); } });
    const msgs = h('div', { class: 'msgs' }, chatVerlauf(c));
    const chk = S.checks[c.id];
    const fact = FACT[chk && chk.state === 'done' ? chk.status : 'grau'];
    const vorschlag = h('div', { class: 'suggest scrollx' }, icon('chat', { sm: true }),
      h('button', { type: 'button', class: 'fakt-vorschlag', disabled: !!(chk && chk.state === 'run'), onClick: factCheck }, h('span', { class: 'dot', style: 'background:' + fact.color }), tt('Prüfe diesen Beitrag')),
      ['Worum geht’s?', tt('Was sagt die Gegenseite?')].map((t) => h('button', { type: 'button', onClick: () => chat(t) }, t)));
    L.appendChild(h('div', { class: 'sheet ein-fenster' },
      h('div', { class: 'sheet-head' }, h('div', {}, h('b', {}, tt('KI & Faktencheck')), h('div', { class: 'small' }, (S.entries[c.whoKey] || {}).name || c.who)), faktKnopf(c), closeBtn(tt('Schließen'), () => { S.chatOpen = false; render(); })),
      msgs,
      S.msgs.length ? null : vorschlag,
      h('div', { class: 'composer' }, h('label', { for: 'k-chat', class: 'sr' }, tt('Frage zum Beitrag')), input,
        h('button', { type: 'button', 'aria-label': tt('Senden'), onClick: () => chat(S.draft) }, icon('send')))));
    setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 0);
  } else if (!wide && S.chatOpen && c) {
    const input = h('input', { id: 'k-chat', placeholder: tt('Frag deinen Agenten …'), value: S.draft, autocomplete: 'off',
      onInput: (e) => { S.draft = e.target.value; }, onKeydown: (e) => { if (e.key === 'Enter') chat(S.draft); } });
    const msgs = h('div', { class: 'msgs' }, S.msgs.map((m) => h('div', { class: 'msg ' + m.who + (m.wait ? ' wait' : '') }, typeof msgInhalt === 'function' ? msgInhalt(m) : m.text)));
    const chk = S.checks[c.id];
    const fact = FACT[chk && chk.state === 'done' ? chk.status : 'grau'];
    L.appendChild(h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' }, h('div', {}, h('b', {}, tt('KI-Check & Dialog')), h('div', { class: 'small' }, (S.entries[c.whoKey] || {}).name || c.who)), closeBtn(tt('Schließen'), () => { S.chatOpen = false; render(); })),
      h('div', { class: 'sheet-fact' },
        h('div', { class: 'sheet-fact-row' }, h('span', { class: 'dot', style: 'background:' + fact.color }), h('b', {}, tt('Faktencheck: ') + (chk && chk.state === 'run' ? tt('läuft …') : fact.label)),
          h('button', { type: 'button', class: 'mini primary', disabled: !!(chk && chk.state === 'run'), onClick: factCheck }, chk && chk.state === 'done' ? tt('Erneut prüfen') : tt('KI prüfen lassen'))),
        chk && (chk.state === 'done' || chk.state === 'fehler') ? (typeof faktNotiz === 'function' ? faktNotiz(chk) : h('div', { class: 'note' }, chk.text + (chk.by ? '\n\n— ' + chk.by : ''))) : null),
      msgs,
      S.msgs.length ? null : renderSuggest(),
      h('div', { class: 'composer' }, h('label', { for: 'k-chat', class: 'sr' }, tt('Frage zum Beitrag')), input,
        h('button', { type: 'button', 'aria-label': tt('Senden'), onClick: () => chat(S.draft) }, icon('send')))));
    setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 0);
  }
  if (S.cfgKey && S.entries[S.cfgKey]) L.appendChild(renderCfg(S.entries[S.cfgKey]));
  if (S.add) L.appendChild(renderAdd());
  if (S.paket) L.appendChild(renderPaket());
  if (S.posten) L.appendChild(renderPosten());
  if (S.screen === 'history') L.appendChild(renderHistory());
  if (S.screen === 'settings' || S.screen === 'onboarding') L.appendChild(renderSettings(S.screen === 'onboarding'));
  if (S.pause) L.appendChild(renderPause());
  if (S.toast) L.appendChild(h('div', { class: 'toast', role: 'status' }, S.toast));
}

// #52 (Modul pause-zaehler): leiser Zähler neben „N heute“ – wie viele Beiträge noch bis zur nächsten Pause
function pauseZaehler() {
  if (!modulAn('pause-zaehler') || !(settings.pauseAfter > 0) || S.nextPauseAt == null) return null;
  const n = Math.max(0, S.nextPauseAt - S.day.n);
  return h('span', { class: 'pause-zaehler', 'aria-label': tt('noch {n} Beiträge bis zur Pause').replace('{n}', n) }, tt('noch {n} bis Pause').replace('{n}', n));
}
