// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Einstellungen, Verlauf, Eintrag-Einstellungen, Pause. Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

function setName(k, name) {
  const nm = String(name || '').trim();
  if (nm) S.names[k] = nm; else delete S.names[k];
  // alte Gruppen-Namen mit denselben Mitgliedern aufräumen
  const e = S.entries[k];
  if (e && e.members) { const mk = new Set(e.members.map((m) => m.key)); Object.keys(S.names).forEach((x) => { if (x !== k && x.startsWith('p:') && x.slice(2).split('+').some((y) => mk.has(y))) delete S.names[x]; }); }
  S.nameDraft = null; save('names'); build(); render(true);
  flash(nm ? tt('Name festgelegt: ') + nm : tt('Name wieder automatisch.'));
}
function nameBox(e) {
  const k = e.key;
  const draft = S.nameDraft && S.nameDraft.k === k ? S.nameDraft.v : e.name;
  const opts = [...new Set([e.autoName, ...(e.members || []).map((m) => m.name), e.feed && e.feed.title].filter((x) => x && x !== e.name))];
  return h('div', { class: 'members' },
    h('span', { class: 'small' }, tt('Angezeigter Name') + (e.customName ? ' (von dir festgelegt)' : '')),
    h('div', { class: 'add-search' },
      h('div', { class: 'search', style: 'flex:1' }, h('label', { for: 'k-name', class: 'sr' }, tt('Name')),
        h('input', { id: 'k-name', value: draft, autocomplete: 'off', onInput: (ev) => { S.nameDraft = { k, v: ev.target.value }; }, onKeydown: (ev) => { if (ev.key === 'Enter') setName(k, ev.target.value); } })),
      h('button', { type: 'button', class: 'mini primary', onClick: () => setName(k, S.nameDraft && S.nameDraft.k === k ? S.nameDraft.v : e.name) }, tt('Übernehmen'))),
    opts.length ? h('div', { class: 'btn-row' }, h('span', { class: 'small', style: 'align-self:center' }, tt('Übernehmen von:')),
      opts.map((o) => h('button', { type: 'button', class: 'mini', onClick: () => setName(k, o) }, o))) : null,
    e.customName ? h('button', { type: 'button', class: 'mini', style: 'align-self:flex-start', onClick: () => setName(k, '') }, tt('Automatisch benennen')) : null);
}
function renderCfg(e) {
  const k = e.key; const cv = cfgOf(k);
  const set = (field) => () => { S.cfg[k] = Object.assign({}, cv, { [field]: !cv[field] }); save('cfg'); render(); };
  const row = (label, hint, on, fn) => h('button', { type: 'button', class: 'toggle-row', 'aria-pressed': on ? 'true' : 'false', onClick: fn },
    h('span', { class: 'row-text' }, h('span', { style: 'font-size:15px' }, label), h('span', { class: 'row-sub', style: 'white-space:normal' }, hint)), h('span', { class: 'switch' }));
  return h('div', { class: 'overlay', onClick: (ev) => { if (ev.target === ev.currentTarget) { S.cfgKey = null; render(); } } },
    h('div', { class: 'bottom-sheet', role: 'dialog', 'aria-label': tt('Einstellungen für ') + e.name },
      h('div', { class: 'card-head', style: tt('padding:8px 8px 12px;border-bottom:1px solid var(--line)') }, avatar(e, 40),
        h('div', { class: 'row-text' }, h('b', {}, e.name), h('span', { class: 'row-sub' }, (e.handle && !e.members ? e.handle + ' · ' : '') + e.sub)),
        closeBtn(tt('Einstellungen schließen'), () => { S.cfgKey = null; render(); })),
      nameBox(e),
      row(tt('Im Feed zeigen'), cv.show ? tt('Beiträge erscheinen im Feed') : tt('Stumm – erscheint nur bei direkter Auswahl'), cv.show, set('show')),
      row(tt('Ungelesene zählen'), tt('Zahl am Symbol in der Leiste'), cv.count, set('count')),
      row(tt('Favorit'), tt('Erscheint in der Standardansicht'), !!S.favs[k], () => toggleFav(k)),
      e.members ? h('div', { class: 'members' },
        h('span', { class: 'small' }, tt('Zusammengeführt – Grund: ') + e.why),
        e.members.map((m) => h('div', { class: 'member' }, avatar(m, 28),
          h('span', { class: 'row-text' }, h('span', { class: 'dupe-title' }, m.name),
            h('span', { class: 'row-sub' }, m.handle + ' · ' + SERVICE_LABEL[m.service] + ' · ' + (m.type === 'kontakt' ? tt('Kontakt') : tt('Creator')))))),
        h('button', { type: 'button', class: 'mini', style: 'align-self:flex-start', onClick: () => decide(e.pairs, 'nein', tt('Getrennt – wieder einzelne Einträge.')) }, tt('Trennen'))) : null,
      (() => {
        const sg = S.suggest.filter((s) => s.a === k || s.b === k);
        return sg.length ? h('div', { class: 'members' }, h('span', { class: 'small' }, tt('Vielleicht dieselbe Quelle auf einem anderen Dienst:')), sg.map((s) => dupeRow(s, k))) : null;
      })(),
      e.feed ? h('div', { class: 'members' }, h('span', { class: 'small', style: 'overflow-wrap:anywhere' }, (e.service === 'youtube' ? tt('YouTube-Kanal · ') : tt('Feed · ')) + e.feed.url),
        e.feed.site ? h('a', Object.assign({ href: e.feed.site, class: 'small' }, EXT), tt('Website öffnen')) : null) : null,
      e.feed ? h('button', { type: 'button', class: 'link-row danger', onClick: () => removeFeed(e.feed.id) }, tt('Quelle entfernen')) : null,
      e.kompass ? h('button', { type: 'button', class: 'link-row danger', onClick: () => removeKF(k) }, tt('In KOMPASS entfolgen')) : null,
      h('p', { class: 'small', style: 'padding:4px 8px' }, tt('Automatisches Prüfen folgt in einer späteren Stufe.'))));
}

function renderHistory() {
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const fill = () => {
    list.textContent = '';
    const q = S.q.toLowerCase();
    const items = S.history.filter((x) => !S.onlyMarked || S.marked[x.id]).map((x) => Object.assign({ t: x.t }, S.byId[x.id] || S.cache[x.id])).filter((p) => p && p.id)
      .filter((p) => !q || (p.who + ' ' + (p.title || '') + ' ' + (p.text || '')).toLowerCase().includes(q)).slice(0, 200);
    if (!items.length) { list.appendChild(h('p', { class: 'small', style: tt('text-align:center;padding:24px 0') }, S.history.length ? tt('Nichts gefunden.') : tt('Noch nichts angesehen.'))); return; }
    items.forEach((p) => {
      const m = !!S.marked[p.id];
      list.appendChild(h('div', { class: 'hist' },
        h('button', { type: 'button', class: 'hist-main', onClick: () => { S.screen = null; if (!S.byId[p.id]) S.byId[p.id] = S.cache[p.id]; show(p.id, 'up'); } },
          h('span', { class: 'small' }, p.who + ' · ' + ago(new Date(p.t).toISOString())), h('span', {}, p.title || p.text)),
        h('button', { type: 'button', class: 'ghost', 'aria-label': tt('Merken'), 'aria-pressed': m ? 'true' : 'false',
          onClick: () => { if (m) delete S.marked[p.id]; else S.marked[p.id] = Date.now(); save('marked'); fill(); render(); } }, icon('mark', { filled: m }))));
    });
  };
  fill();
  return h('div', { class: 'screen' },
    h('div', { class: 'screen-head' }, h('div', {}, h('h2', {}, tt('Verlauf')), h('div', { class: 'small' }, S.day.n + tt(' heute · ') + S.total.toLocaleString('de-DE') + tt(' gesamt · nur auf diesem Gerät'))),
      closeBtn(tt('Verlauf schließen'), () => { S.screen = null; render(); })),
    h('div', { class: 'screen-body' },
      h('div', { class: 'search' }, icon('search', { sm: true }), h('label', { for: 'k-search', class: 'sr' }, tt('Im Verlauf suchen')),
        h('input', { id: 'k-search', placeholder: tt('Im Verlauf suchen …'), value: S.q, autocomplete: 'off', onInput: (e) => { S.q = e.target.value; fill(); } })),
      h('button', { type: 'button', class: 'filter-pill', 'aria-pressed': S.onlyMarked ? 'true' : 'false', onClick: () => { S.onlyMarked = !S.onlyMarked; render(); } }, tt('Nur Gemerkte')),
      list));
}

function renderStorage(onboarding) {
  const box = h('div', { class: 'card-box' + (onboarding ? ' accent-box' : '') }, h('h3', {}, onboarding && !sync.provider ? tt('Schon eingerichtet?') : tt('Speicherort und Abgleich')));
  if (sync.provider) {
    const c = CONN[sync.provider];
    const st = SY.busy ? tt('gleicht ab …') : SY.error ? tt('Fehler: ') + SY.error : sync.last ? 'zuletzt abgeglichen ' + ago(new Date(sync.last).toISOString()) : 'noch nicht abgeglichen';
    const url = c.openUrl();
    box.append(
      h('div', { class: 'store-status' }, h('span', { class: 'dot', style: 'background:' + (SY.error ? 'var(--f-rot)' : 'var(--f-gruen)') }),
        h('span', { class: 'row-text' }, h('b', { style: 'font-size:14px' }, c.label()), h('span', { class: 'row-sub', style: 'white-space:normal' }, st))),
      h('span', { class: 'small' }, tt('Ordner „KOMPASS“: kompass-einstellungen.json und kompass-verlauf.json – lesbares JSON.')),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'mini primary', disabled: SY.busy, onClick: () => syncNow(true) }, tt('Jetzt abgleichen')),
        url ? h('a', { class: 'mini linkish', href: url, target: '_blank', rel: 'noopener noreferrer' }, tt('Im Drive ansehen')) : null,
        h('button', { type: 'button', class: 'mini', onClick: disconnectStorage }, tt('Trennen'))));
    return box;
  }
  box.append(h('p', { class: 'small', style: 'margin:0;line-height:1.5' }, onboarding
    ? tt('Dann lade deine Konten, Favoriten und deinen Verlauf aus deinem Speicher – nichts neu einrichten.')
    : tt('Gerade nur auf diesem Gerät. Verbinde deinen Speicher, damit Handy und PC dieselben Konten, Favoriten und denselben Verlauf haben. Die Daten liegen lesbar als JSON im Ordner „KOMPASS“.')));
  box.append(h('div', { class: 'choices', style: 'grid-template-columns:repeat(2,minmax(0,1fr))' },
    h('button', { type: 'button', class: 'filter-pill', style: 'align-self:auto', 'aria-pressed': SY.pick === 'gdrive' ? 'true' : 'false', onClick: () => GD.prepare() }, tt('Google Drive')),
    h('button', { type: 'button', class: 'filter-pill', style: 'align-self:auto', 'aria-pressed': SY.pick === 'dav' ? 'true' : 'false', onClick: () => { SY.pick = 'dav'; render(); } }, tt('WebDAV (EU)'))));
  if (SY.pick === 'gdrive') {
    if (SY.gState === 'bereit') box.append(h('button', { type: 'button', class: 'btn primary', onClick: () => GD.start() }, tt('Mit Google anmelden')),
      h('span', { class: 'small', style: 'line-height:1.4' }, tt('KOMPASS bekommt nur Zugriff auf die eigenen Dateien im Ordner „KOMPASS“ (Berechtigung drive.file), nicht auf deine übrigen Dateien.')));
    else box.append(h('span', { class: 'small' }, SY.gState === 'fehlt' ? tt('Google ist im KOMPASS-Backend noch nicht eingerichtet (Client-ID und Schlüssel fehlen in config.php).')
      : SY.gState === 'fehler' ? tt('Google-Anmeldung konnte nicht vorbereitet werden – Verbindung prüfen.') : tt('Bereite Google-Anmeldung vor …')));
  }
  if (SY.pick === 'dav') {
    const inp = (id, label, key, type, ph) => h('div', { class: 'field' }, h('label', { for: id }, label),
      h('input', { id, type, value: SY.dav[key], placeholder: ph, autocomplete: type === 'password' ? 'current-password' : 'off', autocapitalize: 'off', spellcheck: 'false',
        onInput: (e) => { SY.dav[key] = e.target.value.trim(); } }));
    box.append(
      inp('k-dav-url', 'WebDAV-Adresse', 'url', 'url', 'https://cloud.beispiel.de/remote.php/dav/files/name/'),
      inp('k-dav-user', tt('Benutzer'), 'user', 'text', ''),
      inp('k-dav-pass', 'App-Passwort', 'pass', 'password', ''),
      h('span', { class: 'small', style: 'line-height:1.4' }, tt('Nextcloud: Einstellungen → Dateien → WebDAV-Adresse, App-Passwort unter Sicherheit anlegen. Strato HiDrive, MagentaCLOUD u. a.: WebDAV-Adresse des Anbieters. Die Anfragen laufen per HTTPS über das KOMPASS-Backend (der Browser darf diese Speicher nicht direkt ansprechen); dort wird nichts gespeichert. Das App-Passwort bleibt auf diesem Gerät.')),
      h('button', { type: 'button', class: 'btn primary', disabled: SY.connecting || SY.busy, onClick: async () => {
        SY.connecting = true; render();
        try { await DAV.connect({ url: SY.dav.url, user: SY.dav.user, pass: SY.dav.pass }); }
        catch (e) { flash(e.message); }
        SY.connecting = false; render();
      } }, SY.connecting ? tt('Verbinde …') : tt('Verbinden')));
  }
  return box;
}

function renderSettings(onboarding) {
  if (!S.form) S.form = { mastodon: settings.mastodon, bluesky: settings.bluesky, radar: Object.assign({}, settings.radar), pauseAfter: settings.pauseAfter,
    name: settings.name || '', olAnhang: settings.olAnhang !== false, ping: pingAn() };
  const f = S.form;
  const field = (id, label, hint, val, ph, key) => h('div', { class: 'field' },
    h('label', { for: id }, label),
    h('input', { id, value: val, placeholder: ph, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', onInput: (e) => { f[key] = e.target.value.trim(); } }),
    h('span', { class: 'small' }, hint));
  const radarRows = Object.keys(RADAR_FEEDS).map((k) => {
    const b = h('button', { type: 'button', class: 'toggle-row', 'aria-pressed': f.radar[k] ? 'true' : 'false' },
      h('span', { class: 'row-text' }, h('span', { style: 'font-size:15px' }, RADAR_FEEDS[k])), h('span', { class: 'switch' }));
    b.addEventListener('click', () => { f.radar[k] = !f.radar[k]; b.setAttribute('aria-pressed', f.radar[k] ? 'true' : 'false'); });
    return b;
  });
  const pauseBtns = h('div', { class: 'choices', style: 'grid-template-columns:repeat(4,minmax(0,1fr))' });
  const drawPause = () => {
    pauseBtns.textContent = '';
    [[10, '10'], [20, '20'], [50, '50'], [0, 'aus']].forEach(([n, l]) => pauseBtns.appendChild(h('button', { type: 'button', class: 'filter-pill', style: 'align-self:auto', 'aria-pressed': f.pauseAfter === n ? 'true' : 'false',
      onClick: () => { f.pauseAfter = n; drawPause(); } }, l)));
  };
  drawPause();
  const apply = () => {
    settings.mastodon = f.mastodon; settings.bluesky = f.bluesky; settings.radar = f.radar; settings.pauseAfter = f.pauseAfter; settings.onboarded = true;
    settings.name = String(f.name || '').trim().slice(0, NAME_MAX); settings.olAnhang = f.olAnhang !== false;
    zentralePingUebernehmen(f); zentraleTitel();
    S.nextPauseAt = S.day.n + (settings.pauseAfter || 0);
    if (onboarding) { Object.keys(RADAR_FEEDS).forEach((k) => { if (settings.radar[k]) S.favs[k] = true; }); save('favs'); }
    save('settings'); S.screen = null; S.form = null; render(); loadAll();
  };
  return h('div', { class: 'screen' },
    h('div', { class: 'screen-head' }, h('div', {}, h('h2', {}, onboarding ? tt('Willkommen bei {name}').replace('{name}', zentraleName()) : tt('Einstellungen')), h('div', { class: 'small' }, zentraleVersion())), onboarding ? h('span', {}) : closeBtn(tt('Einstellungen schließen'), () => { S.screen = null; S.form = null; render(); })),
    h('div', { class: 'screen-body' },
      h('div', { class: 'card-box' }, h('h3', {}, tt('Sprache')),
        h('div', { class: 'choices', style: 'grid-template-columns:repeat(' + SPRACHEN.length + ',minmax(0,1fr))' },
          SPRACHEN.map(([code, name]) => h('button', { type: 'button', class: 'filter-pill', style: 'align-self:auto', 'aria-pressed': LANG === code ? 'true' : 'false',
            onClick: () => { if (code === LANG) return; settings.sprache = code; save('settings'); location.reload(); } }, name)))),
      zentraleNameFeld(f),
      onboarding ? h('p', { style: 'margin:0;color:var(--ink2)' }, tt('Wo bist du unterwegs? KOMPASS übernimmt, wem du folgst – nur lesend, ohne Passwort. Alles, was du hier einstellst, bleibt auf diesem Gerät – oder zusätzlich in deinem eigenen Speicher, wenn du einen verbindest.')) : null,
      renderStorage(onboarding),
      !onboarding ? renderKiBox() : null,
      h('div', { class: 'card-box' }, h('h3', {}, tt('Netzwerke')),
        field('k-masto', tt('Mastodon'), tt('Format @name@instanz – öffentliche Folgeliste (bis 400 Konten). Beiträge sofort von ') + MAX_ACCOUNTS + tt(' Konten, Favoriten zuerst; die übrigen beim Antippen.'), f.mastodon, '@name@mastodon.social', 'mastodon'),
        field('k-bsky', tt('Bluesky'), tt('Format name.bsky.social – öffentliche Folgeliste (bis 500 Konten). Beiträge sofort von ') + MAX_ACCOUNTS + tt(' Konten, Favoriten zuerst; die übrigen beim Antippen.'), f.bluesky, 'name.bsky.social', 'bluesky')),
      radarRows.length ? h('div', { class: 'card-box' }, h('h3', {}, tt('RADAR 724')), radarRows) : null,
      !onboarding ? h('div', { class: 'card-box' }, h('h3', {}, tt('In KOMPASS hinzugefügt')),
        h('p', { class: 'small', style: 'margin:0;line-height:1.5' }, tt('YouTube-Kanäle, Websites und Konten, denen du nur in KOMPASS folgst. Wird mit deinem Speicher abgeglichen.')),
        settings.feeds.length || S.kfollows.length ? h('div', { class: 'own-list' },
          settings.feeds.map((f) => h('div', { class: 'add-row' }, avatar({ key: 'f:' + f.id, name: f.title, avatar: f.icon }, 30),
            h('span', { class: 'row-text' }, h('span', { class: 'row-title', style: 'font-size:14px' }, f.title), h('span', { class: 'row-sub' }, (f.kind === 'youtube' ? 'YouTube' : 'Web/RSS') + ' · ' + hostOf(f.site || f.url))),
            h('button', { type: 'button', class: 'ghost', 'aria-label': f.title + ' entfernen', onClick: () => removeFeed(f.id) }, icon('close', { sm: true })))),
          S.kfollows.map((f) => h('div', { class: 'add-row' }, avatar({ key: f.key, name: f.name, avatar: f.avatar }, 30),
            h('span', { class: 'row-text' }, h('span', { class: 'row-title', style: 'font-size:14px' }, f.name), h('span', { class: 'row-sub' }, (SERVICE_LABEL[f.service] || f.service) + ' · ' + (f.handle || ''))),
            h('button', { type: 'button', class: 'ghost', 'aria-label': f.name + ' entfolgen', onClick: () => removeKF(f.key) }, icon('close', { sm: true }))))) : null,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'mini primary', onClick: () => openAdd() }, tt('+ Quelle hinzufügen')),
          h('button', { type: 'button', class: 'mini', title: tt('Feed-Liste aus einem anderen Reader (OPML-Datei) übernehmen'), onClick: opmlImport }, tt('Importieren (OPML)')),
          h('button', { type: 'button', class: 'mini', title: tt('Deine Quellen als OPML-Datei sichern oder in einen anderen Reader mitnehmen'), onClick: opmlExport }, tt('Exportieren (OPML)')))) : null,
      h('div', { class: 'card-box' }, h('h3', {}, tt('Pausen-Hinweis nach … Beiträgen')), pauseBtns),
      !onboarding ? (() => {
        const auto = Object.values(S.entries).filter((x) => x.members).length;
        const own = Object.keys(S.merges).length;
        return h('div', { class: 'card-box' }, h('h3', {}, tt('Zusammenführen')),
          h('p', { class: 'small', style: 'margin:0;line-height:1.5' },
            tt('Wer auf Mastodon und Bluesky ist, erscheint als ein Eintrag – automatisch bei eindeutigen Belegen (bestätigte Website, eigene Domain, gegenseitiger Profil-Verweis), sonst als Vorschlag in der Übersicht. Trennen: Eintrag lang drücken bzw. Rechtsklick.')),
          h('span', { class: 'small' }, auto + tt(' zusammengeführt · ') + own + tt(' Entscheidung') + (own === 1 ? '' : 'en') + ' von dir'),
          own ? h('button', { type: 'button', class: 'mini', style: 'align-self:flex-start', onClick: () => { S.merges = {}; save('merges'); build(); render(true); flash(tt('Entscheidungen zurückgesetzt.')); } }, tt('Meine Entscheidungen zurücksetzen')) : null);
      })() : null,
      h('div', { class: 'card-box' }, h('h3', {}, tt('Starter-Paket')),
        h('p', { class: 'small', style: 'margin:0;line-height:1.5' }, tt('Lass dir von deiner KI ein Paket mit Quellen zusammenstellen – oder gib deine Quellen an Familie und Freunde weiter. Vor dem Übernehmen siehst du immer eine Vorschau.')),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'mini primary', onClick: () => { S.paket = { stufe: 'eingeben', text: '' }; render(); } }, tt('Paket einfügen')),
          !onboarding ? h('button', { type: 'button', class: 'mini', onClick: () => { S.paket = { stufe: 'teilen' }; render(); } }, tt('Mein Paket teilen')) : null)),
      zentralePingBox(f),
      !onboarding ? postenBox() : null,  // Haken Posten (posten/posten.js)
      h('button', { type: 'button', class: 'btn primary', onClick: apply }, onboarding ? tt('Los geht’s') : tt('Speichern und neu laden')),
      h('div', { class: 'card-box' }, h('h3', {}, tt('Datenschutz in dieser Stufe')),
        pingMoeglich() ? h('p', { class: 'small', style: 'margin:0 0 6px;line-height:1.5' }, tt('Der freiwillige Installations-Ping meldet deine Installation (ohne Quellen, Konten oder Verlauf) ans Zero Ledger auf {ziel} – höchstens einmal pro Woche, hier jederzeit abschaltbar.').replace('{ziel}', hostOf(INSTANZ.ping))) : null,
        h('p', { class: 'small', style: 'margin:0;line-height:1.5' },
          tt('Einstellungen, Verlauf, Likes, Lesezeichen und Favoriten liegen im Speicher dieses Browsers – und, wenn verbunden, lesbar als JSON im Ordner „KOMPASS“ deines Google Drive bzw. WebDAV-Speichers (Übertragung per HTTPS; Google direkt vom Gerät, WebDAV über das KOMPASS-Backend durchgeleitet, ohne Speicherung). Mastodon und Bluesky werden direkt von deinem Gerät abgefragt. RADAR läuft über das KOMPASS-Backend auf {host} (ohne Nutzerdaten). Fragen an den Agenten, Faktenchecks und die KI-Auswahl gehen direkt von deinem Gerät an die KI, die du verbindest – oder, ohne eigene KI, als Probe über das Backend an Mistral (EU), ohne Speicherung. KI-Schlüssel liegen verschlüsselt nur auf diesem Gerät.').replace('{host}', location.host) + (window.OL_ZAEHLER ? ' ' + tt('Aufrufe der Seite zählt GoatCounter ohne Cookies und ohne Nutzerprofil.') : ''))),
      !onboarding ? h('button', { type: 'button', class: 'link-row danger', onClick: () => { if (confirm(tt('Alle lokalen KOMPASS-Daten auf diesem Gerät löschen – auch die verbundenen KI-Schlüssel?'))) { store.clear(); kiTresorLeeren(); setTimeout(() => location.reload(), 150); } } }, tt('Lokale Daten löschen')) : null,
      h('p', { class: 'small', style: 'text-align:center' }, tt('{name} Prototyp ').replace('{name}', INSTANZ.name) + VERSION)));
}

function renderPause() {
  const close = (n) => { S.pause = false; S.pauseDone = false; S.nextPauseAt = S.day.n + n; render(); };
  const marked = Object.keys(S.marked).length;
  return h('div', { class: 'overlay center' },
    h('div', { class: 'dialog', role: 'dialog', 'aria-label': 'Pausen-Hinweis' },
      S.pauseDone ? [
        h('h2', {}, tt('Bis später')),
        h('p', {}, tt('Heute: ') + S.day.n + tt(' Beiträge angesehen, ') + marked + tt(' gemerkt. Alles bleibt im Verlauf.')),
        h('button', { type: 'button', class: 'btn', onClick: () => close(settings.pauseAfter || 20) }, tt('Doch noch einen'))
      ] : [
        h('h2', {}, tt('Kurz durchatmen?')),
        h('p', {}, tt('Du hast heute ') + S.day.n + tt(' Beiträge angesehen. Vielleicht ist jetzt ein guter Moment für eine Pause – oder du machst einfach weiter.')),
        h('div', { style: 'display:flex;gap:8px' },
          h('button', { type: 'button', class: 'btn', style: 'flex:1', onClick: () => close(settings.pauseAfter || 20) }, tt('Weiter')),
          h('button', { type: 'button', class: 'btn primary', style: 'flex:1', onClick: () => { S.pauseDone = true; render(); } }, tt('Genug für heute'))),
        h('span', { class: 'small' }, tt('Weiter – nächste Rückfrage nach … Beiträgen')),
        h('div', { class: 'choices' }, [10, 20, 50].map((n) => h('button', { type: 'button', class: 'btn', onClick: () => close(n), 'aria-label': tt('Nächste Rückfrage nach ') + n + tt(' Beiträgen') }, String(n))))
      ]));
}
