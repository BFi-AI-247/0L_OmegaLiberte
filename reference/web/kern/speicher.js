// SPDX-License-Identifier: AGPL-3.0-only
// Kern – Abgleich mit WebDAV (Google Drive entfernt, #66). Besitzer: Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- Speicher: Abgleich über WebDAV (EU-Dienste, eigene Nextcloud) -----------------
   Zwei lesbare JSON-Dateien im Ordner „KOMPASS“ des Nutzers. Bewusst ohne Verschlüsselung
   (Björn, 18.10.2026): Übertragung per HTTPS, der Nutzer kann alles lesen und prüfen.
   Abgleich: Teile mit Zeitstempel – der neuere gewinnt; Verlauf, Gesehen, Faktenchecks und
   Beitrags-Kurzfassungen werden vereinigt; Zähler nehmen den höheren Wert. */
const SYNC_FILES = {
  einstellungen: { name: 'kompass-einstellungen.json', parts: ['settings', 'favs', 'cfg', 'merges', 'kfollows', 'names'] },
  verlauf: { name: 'kompass-verlauf.json', parts: ['history', 'seen', 'marked', 'liked', 'checks', 'cache', 'zaehler'] }
};
const PART_FILE = {};
Object.entries(SYNC_FILES).forEach(([f, d]) => d.parts.forEach((p) => { PART_FILE[p] = f; }));
const UNION = { history: true, seen: true, checks: true, cache: true, zaehler: true };
const sync = Object.assign({ provider: null, t: {}, last: 0, gdrive: {}, dav: {} }, store.get('sync', {}));
const SY = { busy: false, again: false, timer: null, at: 0, error: '', applying: false, json: {}, pick: null, gState: '', clientId: '',
  dav: { url: (sync.dav && sync.dav.url) || '', user: (sync.dav && sync.dav.user) || '', pass: '', profil: (sync.dav && sync.dav.profil) || '' } };
// #60 (Modul speicher-profil): Profil für geteilte WebDAV-Zugänge – Dateien dann in KOMPASS/<profil>/. Leer = wie bisher KOMPASS/.
// Muss nur unter denen eindeutig sein, die sich denselben Zugang teilen; liegt nur auf dem Gerät (store 'sync'), nicht im Abgleich.
function davProfil(c) { const p = modulAn('speicher-profil') ? String((c || sync.dav || {}).profil || '').trim() : ''; return /^[\p{L}\p{N} ._-]{1,40}$/u.test(p) && !/^\.+$/.test(p) ? p : ''; }
function storeSync() { store.set('sync', sync); }
function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? tt('Android') : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? tt('Windows') : /Mac/.test(ua) ? tt('Mac') : /Linux/.test(ua) ? tt('Linux') : tt('Gerät');
  const br = /Edg\//.test(ua) ? tt('Edge') : /Firefox\//.test(ua) ? tt('Firefox') : /Chrome\//.test(ua) ? tt('Chrome') : /Safari\//.test(ua) ? tt('Safari') : '';
  return os + (br ? ' · ' + br : '');
}
function partGet(p) {
  if (p === 'settings') return settings;
  if (p === 'zaehler') return { day: S.day, total: S.total };
  return S[p];
}
function partSet(p, v) {
  if (p === 'settings') { Object.assign(settings, v); store.set('settings', settings); S.nextPauseAt = S.day.n + (settings.pauseAfter || 0); }
  else if (p === 'zaehler') {
    // Fremder Tageszähler nur, wenn er von heute ist und weiter ist; die Pause zählt weiter ab dem Öffnen (sonst kam sie sofort)
    if (v.day && v.day.d === today() && v.day.n > S.day.n) { S.nextPauseAt += v.day.n - S.day.n; S.day = v.day; }
    S.total = v.total || 0; store.set('day', S.day); store.set('total', S.total);
  }
  else if (p === 'seen') {
    const o = {}; Object.entries(v || {}).forEach(([k, t]) => { const h = k.length > 12 ? sk(k) : k; if (!o[h] || o[h] > t) o[h] = t; });
    S.seen = o; store.set('seen', o);
  } else { S[p] = v; store.set(p, v); }
  SY.json[p] = JSON.stringify(partGet(p));
}
// Merkt sich echte Änderungen (nicht jedes Speichern) und plant den Abgleich
function noteChange(keys) {
  if (SY.applying) return;
  let soon = false; let any = false;
  for (const k of keys) {
    const p = k === 'day' || k === 'total' ? 'zaehler' : k;
    if (!PART_FILE[p]) continue;
    if (!UNION[p]) { const j = JSON.stringify(partGet(p)); if (SY.json[p] === j) continue; SY.json[p] = j; }
    sync.t[p] = Date.now(); any = true;
    if (PART_FILE[p] === 'einstellungen') soon = true;
  }
  if (!any) return;
  storeSync();
  scheduleSync(soon ? 3000 : 300000);
}
function scheduleSync(ms) {
  if (!sync.provider) return;
  const at = Date.now() + ms;
  if (SY.timer && SY.at <= at) return;
  clearTimeout(SY.timer); SY.at = at;
  SY.timer = setTimeout(() => { SY.timer = null; syncNow(); }, ms);
}
function mergePart(p, local, remote) {
  if (p === 'history') {
    const m = new Map();
    [...(remote || []), ...(local || [])].forEach((x) => { if (x && x.id && (!m.has(x.id) || m.get(x.id).t < x.t)) m.set(x.id, x); });
    return [...m.values()].sort((a, b) => b.t - a.t).slice(0, 500);
  }
  if (p === 'seen') {
    const o = Object.assign({}, remote || {});
    for (const [k, v] of Object.entries(local || {})) o[k] = o[k] ? Math.min(o[k], v) : v;
    const ks = Object.keys(o);
    if (ks.length > 3000) ks.sort((a, b) => o[a] - o[b]).slice(0, ks.length - 3000).forEach((k) => delete o[k]);
    return o;
  }
  if (p === 'cache') {
    const o = Object.assign({}, remote || {}, local || {});
    const ks = Object.keys(o); if (ks.length > 500) ks.slice(0, ks.length - 500).forEach((k) => delete o[k]);
    return o;
  }
  if (p === 'checks') {
    const o = Object.assign({}, remote || {});
    for (const [k, v] of Object.entries(local || {})) {
      const r = o[k];
      if (!r || (v.state === 'done' && (r.state !== 'done' || (v.at || 0) > (r.at || 0)))) o[k] = v;
    }
    return o;
  }
  if (p === 'zaehler') {
    const l = local || {}; const r = remote || {};
    const ld = l.day || {}; const rd = r.day || {};
    const day = ld.d === rd.d ? { d: ld.d, n: Math.max(ld.n || 0, rd.n || 0) } : (rd.d === today() ? rd : ld.d ? ld : { d: today(), n: 0 });
    return { day, total: Math.max(l.total || 0, r.total || 0) };
  }
  return local;
}
// Was in den Speicher geht – schlank: Verlauf 100 Einträge, „Gesehen“ 14 Tage, Beitrags-Kurzfassungen nur für Gemerktes und den Verlauf
const SYNC_SEEN_DAYS = 14; const SYNC_HISTORY = 100;
function outgoing(p, v) {
  if (p === 'history') return (v || []).slice(0, SYNC_HISTORY);
  if (p === 'seen') { const lim = Date.now() - SYNC_SEEN_DAYS * 86400000; const o = {}; Object.entries(v || {}).forEach(([k, t]) => { if (t >= lim) o[k] = t; }); return o; }
  if (p === 'cache') {
    const want = new Set(Object.keys(S.marked).concat((S.history || []).slice(0, SYNC_HISTORY).map((x) => x.id)));
    const o = {};
    Object.entries(v || {}).forEach(([id, c]) => {
      if (!want.has(id) || !c) return;
      o[id] = { id, service: c.service, who: c.who, whoKey: c.whoKey, handle: c.handle, title: c.title || '', text: String(c.text || '').slice(0, 200), link: c.link, date: c.date };
    });
    return o;
  }
  return v;
}
function fileFor(fkey) {
  const teile = {};
  for (const p of SYNC_FILES[fkey].parts) {
    const t = sync.t[p] || 0;
    teile[p] = { geaendert: t ? new Date(t).toISOString() : null, t, wert: outgoing(p, partGet(p)) };
  }
  return { kompass: 'sync-v1', datei: fkey, hinweis: tt('Von KOMPASS geschrieben. Lesbar, aber bitte nicht von Hand ändern, während eine App offen ist.'),
    geraet: deviceName(), stand: new Date().toISOString(), teile };
}
function sourcesKey() { return JSON.stringify([settings.mastodon, settings.bluesky, settings.radar]); }

async function syncNow(manual) {
  if (!sync.provider) return;
  if (SY.busy) { SY.again = true; return; }
  const conn = CONN[sync.provider];
  SY.busy = true; SY.error = ''; if (S.screen) render();
  const before = sourcesKey(); const wasOnboarded = settings.onboarded;
  let changed = false;
  try {
    for (const [fkey, fdef] of Object.entries(SYNC_FILES)) {
      const remote = await conn.read(fdef.name);
      const rt = (remote && remote.teile) || {};
      let push = !remote;
      SY.applying = true;
      for (const p of fdef.parts) {
        const r = rt[p]; const lt = sync.t[p] || 0;
        if (!r) { if (!lt) sync.t[p] = Date.now(); push = true; continue; }
        const rtT = r.t || 0;
        if (UNION[p]) {
          const local = partGet(p);
          const merged = mergePart(p, local, r.wert);
          const mj = JSON.stringify(merged);
          if (mj !== JSON.stringify(local)) { partSet(p, merged); changed = true; }
          if (JSON.stringify(outgoing(p, merged)) !== JSON.stringify(r.wert)) push = true;
          sync.t[p] = Math.max(lt, rtT);
        } else if (rtT > lt) {
          if (JSON.stringify(r.wert) !== JSON.stringify(partGet(p))) { partSet(p, r.wert); changed = true; }
          sync.t[p] = rtT;
        } else if (lt > rtT) push = true;
      }
      SY.applying = false;
      if (push) await conn.write(fdef.name, fileFor(fkey));
    }
    sync.last = Date.now(); storeSync();
    if (manual) flash(tt('Abgeglichen mit ') + conn.label() + '.');
  } catch (e) {
    SY.error = e.message || String(e);
    if (manual) flash(tt('Abgleich fehlgeschlagen: ') + SY.error);
  } finally {
    SY.applying = false; SY.busy = false;
  }
  if (changed) {
    if (settings.onboarded && !wasOnboarded && S.screen === 'onboarding') { S.screen = null; S.form = null; }
    if (settings.onboarded && (sourcesKey() !== before || !wasOnboarded)) loadAll();
    else { build(); render(true); }
  } else render();
  if (SY.again) { SY.again = false; syncNow(); }
}

/* WebDAV (europäische Speicher: Nextcloud, Strato HiDrive, MagentaCLOUD …) über api/dav.php */
const DAV = {
  label() { const p = davProfil(); try { return tt('WebDAV (') + new URL(sync.dav.url).host + (p ? ' · ' + p : '') + ')'; } catch (e) { return 'WebDAV'; } },
  openUrl() { return null; },
  folderUrl(url, cred) {
    const basis = String(url || sync.dav.url).replace(/\/+$/, '') + '/KOMPASS/'; const p = davProfil(cred);
    return cred === 'basis' || !p ? basis : basis + encodeURIComponent(p) + '/';
  },
  async req(methode, name, inhalt, cred, nurBasis) {
    const c = cred || sync.dav;
    const r = await fetch('api/dav.php', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: this.folderUrl(c.url, nurBasis ? 'basis' : c) + (name || ''), user: c.user, pass: c.pass, methode, inhalt }) });
    const d = await r.json().catch(() => ({}));
    if (d.status !== 'ok') throw new Error(d.antwort || tt('WebDAV-Speicher nicht erreichbar.'));
    if (d.code === 401 || d.code === 403) throw new Error(tt('Benutzer oder App-Passwort stimmt nicht.'));
    return d;
  },
  async read(name) {
    const d = await this.req('GET', name);
    if (d.code === 404) return null;
    if (d.code !== 200) throw new Error(tt('WebDAV antwortet mit ') + d.code + '.');
    try { return JSON.parse(d.inhalt); } catch (e) { throw new Error(name + tt(' ist kein gültiges JSON.')); }
  },
  async write(name, obj) {
    const body = JSON.stringify(obj, null, 2);
    let d = await this.req('PUT', name, body);
    if (d.code === 404 || d.code === 409) { if (davProfil()) await this.req('MKCOL', '', null, null, true); await this.req('MKCOL', ''); d = await this.req('PUT', name, body); }
    if (![200, 201, 204].includes(d.code)) throw new Error(tt('WebDAV speichert nicht (') + d.code + ').');
  },
  async connect(cred) {
    if (!/^https:\/\/[^/]+/.test(cred.url)) throw new Error(tt('Bitte die WebDAV-Adresse mit https:// angeben.'));
    let d = await this.req('PROPFIND', '', null, cred);
    if (d.code === 404) {
      if (davProfil(cred)) { const b = await this.req('MKCOL', '', null, cred, true); if (![200, 201, 204, 405].includes(b.code)) throw new Error(tt('Ordner KOMPASS lässt sich nicht anlegen (') + b.code + ').'); }  // #60: erst KOMPASS/, dann KOMPASS/<profil>/
      d = await this.req('MKCOL', '', null, cred); if (![200, 201, 204, 405].includes(d.code)) throw new Error(tt('Ordner KOMPASS lässt sich nicht anlegen (') + d.code + ').');
    }
    else if (d.code !== 207 && d.code !== 200) throw new Error(tt('WebDAV antwortet mit ') + d.code + tt(' – Adresse prüfen.'));
    sync.dav = { url: cred.url.replace(/\/+$/, '') + '/', user: cred.user, pass: cred.pass, profil: davProfil(cred) || undefined };
    await activate('dav');
  },
  async disconnect() { sync.dav = { url: sync.dav.url, user: sync.dav.user, profil: sync.dav.profil }; }
};
const CONN = { dav: DAV };
Object.keys(PART_FILE).forEach((p) => { if (!UNION[p]) SY.json[p] = JSON.stringify(partGet(p)); });

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error(tt('Skript nicht ladbar')));
    document.head.appendChild(s);
  });
}
async function activate(kind) {
  sync.provider = kind; SY.pick = null; storeSync();
  flash(tt('Verbunden mit ') + CONN[kind].label() + tt(' – gleiche ab …'));
  await syncNow(true);
}
async function disconnectStorage() {
  if (!sync.provider) return;
  if (!confirm(tt('Speicher trennen? Die Daten bleiben auf diesem Gerät und im Speicher erhalten.'))) return;
  await CONN[sync.provider].disconnect();
  sync.provider = null; storeSync(); flash(tt('Getrennt – Daten bleiben nur auf diesem Gerät.')); render();
}
