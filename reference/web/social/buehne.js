// SPDX-License-Identifier: AGPL-3.0-only
// Social-Modus – Bühne: eine Karte pro Beitrag, Wisch-Animation; meldet sich über modusRegistrieren() an. Besitzer: Social-Modus (bis zum Start: Bau-Kern).
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

function socialBuehne(stage, animate) {
  const old = [...stage.querySelectorAll('.card, .empty')].filter((x) => !/out-/.test(x.className)).pop();
  const c = cur();
  let next;
  if (S.loading && !c) next = h('div', { class: 'loading' }, tt('Lade deine Quellen …'));
  else if (S.ended && S.filter && MEHR.laeuft[S.filter]) next = h('div', { class: 'loading' }, tt('Lade ältere Beiträge von ') + ((S.entries[S.filter] || {}).name || tt('dieser Quelle')) + ' …');
  else if (S.ended) next = h('div', { class: 'empty' }, h('b', {}, S.filter ? tt('Das war alles, was gerade erreichbar ist') : tt('Alles gesehen')),
    S.filter ? endeHinweis(S.filter) : null,
    S.filter ? null : h('span', {}, aiActive() ? tt('Das war die KI-Auswahl. Alles Weitere findest du chronologisch.') : tt('Du bist durch. Schön!')),
    aiActive() ? h('button', { type: 'button', class: 'btn', onClick: () => setAiMode(false) }, tt('Chronologisch weiterlesen')) : null,
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' },
      h('button', { type: 'button', class: 'btn', onClick: shuffle }, tt('Mischen')),
      h('button', { type: 'button', class: 'btn primary', onClick: loadAll }, tt('Neu laden'))));
  else if (!c) next = h('div', { class: 'empty' }, h('b', {}, tt('Noch keine Beiträge')),
    h('span', {}, S.errors.length ? S.errors.join(' · ') : tt('Verbinde Quellen in den Einstellungen.')),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' },
      h('button', { type: 'button', class: 'btn', onClick: () => { S.screen = 'settings'; render(); } }, tt('Einstellungen')),
      h('button', { type: 'button', class: 'btn primary', onClick: () => openAdd() }, tt('Quelle hinzufügen'))));
  else next = karteFuer(c);
  if (animate && S.dir && old) {
    old.classList.add(S.dir === 'up' ? 'out-up' : 'out-down');
    next.classList.add(S.dir === 'up' ? 'in-up' : 'in-down');
    stage.appendChild(next);
    setTimeout(() => old.remove(), 400);
  } else {
    stage.querySelectorAll('.card, .empty, .loading').forEach((x) => x.remove());
    stage.appendChild(next);
  }
  S.dir = '';
}

modusRegistrieren({ id: 'social', label: tt('Chronologisch'), aktiv: () => true, buehne: socialBuehne });

// Am Ende einer Auswahl: Wo es Älteres gibt (Feeds liefern nur ihr festes Fenster)
function endeHinweis(key) {
  const e = S.entries[key]; if (!e) return null;
  const ms = e.members || [e];
  const seiten = ms.map((m) => (m.feed && (m.feed.site || hostOf(m.feed.url) && 'https://' + hostOf(m.feed.url))) || (m.service === 'mastodon' && m.handle ? 'https://' + String(m.handle).replace(/^@/, '').split('@')[1] + '/@' + String(m.handle).replace(/^@/, '').split('@')[0] : '') || (m.service === 'bluesky' && m.handle ? 'https://bsky.app/profile/' + String(m.handle).replace(/^@/, '') : '')).filter(Boolean);
  const nurFeeds = !mehrMitglieder(key).length;
  return h('span', { class: 'small', style: 'max-width:420px;text-align:center' },
    nurFeeds ? tt('Feeds liefern nur ihre neuesten Einträge. Ältere findest du direkt beim Anbieter: ') : tt('Ältere Beiträge findest du direkt beim Anbieter: '),
    seiten.slice(0, 2).map((u, i) => [i ? ' · ' : '', h('a', Object.assign({ href: u }, EXT), hostOf(u))]));
}
