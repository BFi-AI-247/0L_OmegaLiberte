// SPDX-License-Identifier: AGPL-3.0-only
// Kern – render(), Wischen, Tastatur, Start der App. Wird als letzte Datei geladen. Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

function render(stageToo) {
  const wide = isWide();
  if (!els.stage || els.wide !== wide) {
    app.textContent = '';
    app.classList.toggle('wide', wide);
    els.wide = wide;
    els.stage = h('main', { class: 'stage', 'aria-live': 'polite' });
    els.bottom = h('div', { class: wide ? 'center-bottom' : '' }); els.layer = h('div', { class: 'layer' });
    els.band = h('div', { class: 'ai-band-wrap' });
    if (wide) {
      els.top = null;
      els.side = h('aside', { class: 'side', 'aria-label': tt('Quellen') });
      els.right = h('aside', { class: 'assist', 'aria-label': tt('Faktencheck und Dialog') });
      app.append(els.side, h('div', { class: 'center' }, els.band, els.stage, els.bottom), els.right, els.layer);
    } else {
      els.side = null; els.right = null;
      els.top = h('div');
      app.append(els.top, els.band, els.stage, els.bottom, els.layer);
    }
    bindSwipe(els.stage);
    stageToo = true;
  }
  const scrolls = ['.side-list', '.overview-list', '.screen-body', '.add-list', '.add-sheet'].map((sel) => { const el = app.querySelector(sel); return [sel, el ? el.scrollTop : 0]; });  // #50: Katalog behält Position beim Hinzufügen
  const active = document.activeElement && document.activeElement.id;
  const g = modusGeruest();
  app.dataset.modus = g.id;
  app.classList.toggle('ohne-seite', wide && !g.seite);
  app.classList.toggle('rechts-offen', wide && !!(g.rechts && g.rechts.offen));
  if (wide && g.rechts && g.rechts.breite) app.style.setProperty('--spalte-rechts', Math.round(g.rechts.breite) + 'px'); else app.style.removeProperty('--spalte-rechts');
  if (wide) {
    if (g.seite) els.side.replaceChildren(...renderSide()); else els.side.replaceChildren();
    els.bottom.replaceChildren();
    els.right.replaceChildren(...renderAssist());
    els.right.classList.toggle('pinned', !!((S.assistPin && cur() && S.assistPinId === cur().id) || (cur() && S.checks[cur().id] && S.checks[cur().id].state === 'run') || (S.msgs.length && S.msgs[S.msgs.length - 1].wait)));
  } else {
    els.top.replaceChildren(renderTop());
    els.bottom.replaceChildren(renderActions(false));
  }
  const band = wide ? aiBand() : null; els.band.replaceChildren(...(band ? [band] : []));
  app.classList.toggle('ai-mode', !!S.ai.on);
  if (stageToo) renderStage(true);
  if (S.screen !== 'settings' && S.screen !== 'onboarding') S.form = null;
  renderLayer();
  if (typeof startseitePruefen === 'function') startseitePruefen();  // #43
  if (typeof meldenZeichnen === 'function') meldenZeichnen();  // #46: nur Vorschau
  scrolls.forEach(([sel, y]) => { const el = app.querySelector(sel); if (el && y) el.scrollTop = y; });
  if (['k-chat', 'k-search', 'k-esearch', 'k-add', 'k-name', 'k-wunsch', 'k-masto', 'k-bsky', 'k-dav-url', 'k-dav-user', 'k-dav-pass'].includes(active)) {
    const el = document.getElementById(active);
    if (el && !el.disabled) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* Feldtyp ohne Auswahl */ } }
  }
}
wideMQ.addEventListener('change', () => render(true));

function bindSwipe(stage) {
  let y0 = null; let scroller = null; let st0 = 0;
  const start = (y, target) => { y0 = y; scroller = target.closest && target.closest('.card-body'); st0 = scroller ? scroller.scrollTop : 0; };
  const end = (y) => {
    if (y0 == null) return;
    const dy = y - y0; y0 = null;
    if (Math.abs(dy) < 50 || !modusGeruest().gesten) return;
    if (scroller) {
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      const atTop = scroller.scrollTop <= 0 && st0 <= 0;
      if (dy < 0 && !atBottom) return;
      if (dy > 0 && !atTop) return;
    }
    if (dy < 0) next(); else back();
  };
  stage.addEventListener('touchstart', (e) => start(e.touches[0].clientY, e.target), { passive: true });
  stage.addEventListener('touchend', (e) => end(e.changedTouches[0].clientY), { passive: true });
  // Maus: Ziehen nur außerhalb des Textes (dort soll man markieren können)
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && !(e.target.closest && e.target.closest('.card-body, a, button'))) start(e.clientY, e.target); });
  stage.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') end(e.clientY); });
  stage.addEventListener('wheel', (e) => {
    const sc = e.target.closest && e.target.closest('.card-body');
    if (sc && sc.scrollHeight > sc.clientHeight + 2) return;
    if (Math.abs(e.deltaY) < 30 || stage._wheelLock || !modusGeruest().gesten) return;
    stage._wheelLock = true; setTimeout(() => { stage._wheelLock = false; }, 500);
    if (e.deltaY > 0) next(); else back();
  }, { passive: true });
}

document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (S.paket) { if (e.key === 'Escape' && S.paket.stufe !== 'laeuft') { S.paket = null; render(); } return; }
  if (S.posten) { if (e.key === 'Escape' && S.posten.stufe !== 'senden') { S.posten = null; render(); } return; }  // Posten: Blatt offen, Tasten gehören dem Textfeld
  if (S.screen || S.cfgKey || S.add || S.pause || (!isWide() && S.chatOpen)) { if (e.key === 'Escape') { S.screen = S.screen === 'onboarding' ? S.screen : null; S.cfgKey = null; S.add = null; S.chatOpen = false; S.factOpen = false; S.overview = false; render(); } return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const mt = aktiverModus();
  if (mt && typeof mt.taste === 'function' && mt.taste(e)) return;
  if (!modusGeruest().gesten && ['ArrowDown', 'ArrowUp', 'j', 'k', ' '].includes(e.key)) return;
  if ((e.key === ' ' || e.key === 'Enter') && e.target.closest && e.target.closest('button, a')) return;
  const c = cur();
  switch (e.key) {
    case 'ArrowDown': case 'j': case ' ': e.preventDefault(); next(); break;
    case 'ArrowUp': case 'k': e.preventDefault(); back(); break;
    case 's': shuffle(); break;
    case 'n': discover(); break;
    case 'm': if (c) toggleMark(c.id); break;
    case 'l': if (c) toggleLike(c.id); break;
    case 'f': if (c) { if (isWide()) factCheck(); else { S.chatOpen = !S.chatOpen; render(); } } break;
    case '/': if (isWide()) { const i = document.getElementById('k-chat'); if (i && !i.disabled) { e.preventDefault(); i.focus(); } } break;
    case 'Escape': if (S.overview || S.factOpen || S.assistPin) { S.overview = false; S.factOpen = false; S.assistPin = false; render(); } break;
    default:
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { store.set('lastOpen', Date.now()); if (SY.timer) { clearTimeout(SY.timer); SY.timer = null; syncNow(); } }
  else if (sync.provider && Date.now() - sync.last > 60000) syncNow();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
const EINSTIEG_NEULADEN = einstiegAusAdresse();  // #39: fester Einstieg (z. B. #einstieg=w0) vor dem ersten Zeichnen; Sprache wechselt ohne Neuladen (#44)
startseiteOeffnen();  // #43: Startseite über der App
render(true);
if (settings.onboarded && !EINSTIEG_NEULADEN) loadAll();
zentraleTitel(); pingBeimStart();
paketAusAdresse();
if (sync.provider) syncNow();
kiInit();
