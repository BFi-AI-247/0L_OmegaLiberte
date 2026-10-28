// Social-Modus – Beitragskarten (cardFor) und ihre Bausteine. Besitzer: Social-Modus (bis zum Start des Chats: Bau-Kern).
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

const EXT = { target: '_blank', rel: 'noopener noreferrer' };
function richNodes(v) {
  if (v.rich && v.rich.length) return v.rich.map((x) => x.h ? h('a', Object.assign({ href: x.h, class: 'tlink' }, EXT), x.x) : x.x);
  const t = String(v.text || ''); const out = []; const re = /https?:\/\/[^\s<>"]+/g; let last = 0; let m;
  while ((m = re.exec(t))) { out.push(t.slice(last, m.index)); out.push(h('a', Object.assign({ href: m[0], class: 'tlink' }, EXT), shortUrl(m[0]))); last = m.index + m[0].length; }
  out.push(t.slice(last));
  return out;
}
function linkCard(c) {
  if (!c || !c.url) return null;
  return h('a', Object.assign({ class: 'link-card', href: c.url }, EXT),
    c.image ? h('img', { src: c.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    h('span', { class: 'lc-text' }, h('b', {}, c.title || shortUrl(c.url)), c.desc ? h('span', { class: 'lc-desc' }, c.desc) : null,
      h('span', { class: 'lc-host' }, hostOf(c.url))));
}
function variantIndex(p) {
  if (!p.variants) return 0;
  if (S.variantSel[p.id] != null) return S.variantSel[p.id];
  const i = p.variants.findIndex((v) => v.service === S.variantPref);
  return i >= 0 ? i : 0;
}
// Lange Texte gekürzt mit „mehr“ – weniger Scrollen in der Karte
function clampText(p, v) {
  const long = String(v.text || '').length > (v.video ? 160 : 320);
  const open = !!S.expanded[p.id];
  return h('div', { class: 'text-wrap' },
    h('p', { class: 'card-text' + (v.video ? ' video-text' : '') + (long && !open ? ' clamp' + (v.video ? ' clamp-2' : '') : '') }, richNodes(v)),
    long ? h('button', { type: 'button', class: 'more-btn', onClick: () => { S.expanded[p.id] = !open; render(true); } }, open ? 'weniger' : 'mehr') : null);
}
// YouTube: erst Vorschaubild, der Player (youtube-nocookie) lädt erst beim Antippen
// Video/Audio direkt aus dem Feed (z. B. Sendungen, Podcasts) – lädt erst beim Abspielen
// Text, der nur den Titel wiederholt (z. B. „tagesthemen“), nicht doppelt zeigen
function thinText(v) { return !!(v.title && v.text && normName(v.text) === normName(v.title)); }
// Sendung ohne Anhang im Feed: Video auf der verlinkten Seite suchen (api/rss.php?aktion=medien)
function watchBlock(v) {
  const st = S.mediaLookup[v.link];
  if (st && st.url) return mediaBlock(Object.assign({}, v, { medien: st, thumb: v.thumb || st.bild }), true);
  if (st === 'leer') return h('a', Object.assign({ class: 'btn primary watch-btn', href: v.link }, EXT), tt('Auf ') + hostOf(v.link) + ' ansehen');
  return h('button', { type: 'button', class: 'btn primary watch-btn', disabled: st === 'lade', onClick: async () => {
    S.mediaLookup[v.link] = 'lade'; render(true);
    try { const d = await getJSON('api/rss.php?aktion=medien&url=' + encodeURIComponent(v.link)); S.mediaLookup[v.link] = d.status === 'ok' ? d : 'leer'; }
    catch (e) { S.mediaLookup[v.link] = 'leer'; }
    render(true);
    if (S.mediaLookup[v.link] === 'leer') flash(tt('Kein abspielbares Video gefunden – öffne die Seite.'));
  } }, st === 'lade' ? tt('Suche Video …') : tt('▶ Abspielen'));
}
function mediaBlock(v, autoplay) {
  const m = v.medien;
  // #57: der laufende Player bleibt dasselbe Element, auch wenn die Karte neu gezeichnet wird (Abgleich beim Bildschirm-Aus, Neuladen)
  if (modulAn('hintergrund-audio') && HG.el && HG.el.dataset.src === m.url) return HG.el;
  const el = m.art === 'audio' ? h('audio', { class: 'feed-audio', controls: true, preload: autoplay ? 'auto' : 'none', autoplay: !!autoplay, src: m.url })
    : h('video', { class: 'feed-video', controls: true, preload: autoplay ? 'auto' : 'none', autoplay: !!autoplay, playsinline: true, poster: v.thumb || null, src: m.url });
  if (modulAn('hintergrund-audio')) { el.dataset.src = m.url; el.addEventListener('play', () => { HG.el = el; hgSitzung(v, el); }); }
  return el;
}
// #57 (Modul hintergrund-audio): Podcasts laufen bei Bildschirm-Aus und App-Wechsel weiter – Media Session für Sperrbildschirm und Auto
const HG = { el: null };
function hgSitzung(v, el) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  try {
    const bild = v.thumb || (v.card && v.card.image) || '';
    ms.metadata = new MediaMetadata({ title: v.title || String(v.text || '').slice(0, 80) || tt('Podcast'), artist: v.who || hostOf(v.link || '') || '', album: INSTANZ.marke || 'KOMPASS',
      artwork: bild ? [{ src: bild, sizes: '512x512' }] : [] });
  } catch (e) { /* ältere Browser */ }
  const setze = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* Aktion nicht unterstützt */ } };
  setze('play', () => el.play());
  setze('pause', () => el.pause());
  setze('seekbackward', (d) => { el.currentTime = Math.max(0, el.currentTime - ((d && d.seekOffset) || 15)); });
  setze('seekforward', (d) => { el.currentTime = Math.min(el.duration || Infinity, el.currentTime + ((d && d.seekOffset) || 30)); });
  if (!el._hgZustand) {
    el._hgZustand = true;
    el.addEventListener('pause', () => { try { ms.playbackState = 'paused'; } catch (e) { /* egal */ } });
    el.addEventListener('playing', () => { try { ms.playbackState = 'playing'; } catch (e) { /* egal */ } });
  }
}
// #20 PeerTube eingebettet (Modul peertube): Vorschaubild mit ▶, erst der Druck lädt den Player der Instanz
function peertubeBlock(v, p) {
  if (S.playing === p.id) return h('div', { class: 'video' }, h('iframe', { src: v.ptEmbed + '?autoplay=1&warningTitle=0&title=0', title: v.title || tt('Video'),
    allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' }));
  return h('button', { type: 'button', class: 'video video-thumb', 'aria-label': tt('Video abspielen: ') + (v.title || ''), onClick: () => { S.playing = p.id; render(true); } },
    v.thumb ? h('img', { src: v.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    h('span', { class: 'play' }, h('span', { class: 'play-tri' })));
}
function videoBlock(v, p) {
  if (S.playing === p.id) {
    return h('div', { class: 'video' + (v.short ? ' short' : '') }, h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.video) + '?autoplay=1&rel=0&modestbranding=1&playsinline=1',
      title: v.title || tt('Video'), allow: tt('autoplay; encrypted-media; picture-in-picture; fullscreen'), allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' }));
  }
  return h('button', { type: 'button', class: 'video video-thumb' + (v.short ? ' short' : ''), 'aria-label': tt('Video abspielen: ') + (v.title || ''), onClick: () => { S.playing = p.id; render(true); } },
    h('img', { src: v.thumb || ('https://i.ytimg.com/vi/' + v.video + '/hqdefault.jpg'), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('span', { class: 'play' }, h('span', { class: 'play-tri' })),
    h('span', { class: 'video-note' }, tt('Abspielen lädt den Player von YouTube')));
}
// #85 (Modul video-einbettung): Link-Vorschau einer Videoseite bekommt ▶ statt nur Bild. YouTube über youtube-nocookie,
// Vimeo/PeerTube über den offiziellen Player, sonst das Video, das die Seite selbst angibt (og:video, api/rss.php?aktion=medien) –
// abgespielt direkt vom Gerät, nichts läuft über unseren Server. Erst der Tipp lädt etwas vom Anbieter; nichts gefunden → Link bleibt.
function linkVideoArt(c) {
  if (!c || !c.url) return null;
  let u; try { u = new URL(c.url); } catch (e) { return null; }
  const host = u.hostname.replace(/^(www|m)\./, ''); const pfad = u.pathname;
  let m;
  if (host === 'youtube.com' && pfad === '/watch' && /^[\w-]{11}$/.test(u.searchParams.get('v') || '')) return { art: 'yt', id: u.searchParams.get('v') };
  if ((host === 'youtube.com' && (m = /^\/(?:shorts|live)\/([\w-]{11})/.exec(pfad))) || (host === 'youtu.be' && (m = /^\/([\w-]{11})/.exec(pfad)))) return { art: 'yt', id: m[1], short: /shorts/.test(pfad) };
  if (host === 'vimeo.com' && (m = /^\/(\d{5,})\/?$/.exec(pfad))) return { art: 'frame', src: 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1&dnt=1' };
  if (modulAn('peertube') && (m = /^\/(?:w|videos\/watch)\/([0-9a-f-]{36}|[1-9A-HJ-NP-Za-km-z]{22})\/?$/.exec(pfad))) return { art: 'frame', src: u.origin + '/videos/embed/' + m[1] + '?autoplay=1&warningTitle=0' };
  if (c.typ === 'video' || /\/(video|videos|mediathek|sendung|player)(\/|-|$)/i.test(pfad)) return { art: 'suche' };
  return null;
}
function linkVideoBlock(v, p) {
  if (!modulAn('video-einbettung')) return null;
  const c = v.card; const a = linkVideoArt(c); if (!a) return null;
  const st = S.mediaLookup[c.url];
  if (a.art === 'suche' && st === 'leer') return null;  // nichts Abspielbares → normale Link-Vorschau
  const unter = h('a', Object.assign({ class: 'lv-link', href: c.url }, EXT), h('b', {}, c.title || shortUrl(c.url)), h('span', { class: 'lc-host' }, hostOf(c.url)));
  const spielt = S.playing === 'lv:' + p.id;
  if (spielt && a.art === 'yt') return h('div', { class: 'link-video' }, videoBlock({ video: a.id, short: a.short, title: c.title }, { id: 'lv:' + p.id }), unter);
  if (spielt && a.art === 'frame') return h('div', { class: 'link-video' }, h('div', { class: 'video' }, h('iframe', { src: a.src, title: c.title || tt('Video'),
    allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })), unter);
  if (a.art === 'suche' && st && st.url) return h('div', { class: 'link-video' }, mediaBlock({ medien: st, thumb: c.image || st.bild, title: c.title, link: c.url }, spielt), unter);
  const tippen = async () => {
    if (a.art !== 'suche') { S.playing = 'lv:' + p.id; render(true); return; }
    S.mediaLookup[c.url] = 'lade'; render(true);
    try { const d = await getJSON('api/rss.php?aktion=medien&url=' + encodeURIComponent(c.url)); S.mediaLookup[c.url] = d.status === 'ok' && d.url ? d : 'leer'; }
    catch (e) { S.mediaLookup[c.url] = 'leer'; }
    if (S.mediaLookup[c.url] !== 'leer') S.playing = 'lv:' + p.id;
    render(true);
    if (S.mediaLookup[c.url] === 'leer') flash(tt('Kein abspielbares Video gefunden – öffne die Seite.'));
  };
  const host = a.art === 'yt' ? 'YouTube' : hostOf(a.art === 'frame' ? a.src : c.url);
  return h('div', { class: 'link-video' },
    h('button', { type: 'button', class: 'video video-thumb', disabled: st === 'lade', 'aria-label': tt('Video abspielen: ') + (c.title || hostOf(c.url)), onClick: tippen },
      c.image ? h('img', { src: c.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : (a.art === 'yt' ? h('img', { src: 'https://i.ytimg.com/vi/' + a.id + '/hqdefault.jpg', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
      h('span', { class: 'play' }, h('span', { class: 'play-tri' })),
      h('span', { class: 'video-note' }, st === 'lade' ? tt('Suche Video …') : tt('Abspielen lädt das Video von ') + host)),
    unter);
}
// Herkunft: über welchen Weg und welches Konto/welchen Feed der Beitrag kam
function viaText(v, creator) {
  const lbl = SERVICE_LABEL[v.service] || v.service;
  const other = v.who && v.who !== creator ? v.who : '';
  if (v.service === 'mastodon' || v.service === 'bluesky') return 'via ' + lbl + ' · ' + [other, v.handle].filter(Boolean).join(' ');
  if (v.service === 'rss') return 'via ' + lbl + tt(' · Feed „') + (v.who || hostOf(v.link)) + '“' + (v.link ? ' · ' + hostOf(v.link) : '');
  if (v.service === 'youtube') return tt('via YouTube · Kanal „') + (v.who || '') + '“';
  if (v.service === 'radar') return tt('via RADAR 724') + (other ? ' · ' + other : '');
  return 'via ' + lbl;
}
function cardFor(p) {
  const vs = p.variants || [p]; const vi = variantIndex(p); const v = vs[vi] || p;
  const e = S.entries[v.whoKey] || S.entries[p.whoKey] || { key: v.whoKey, name: v.who, avatar: v.avatar, service: v.service };
  const label = SERVICE_LABEL[v.service] || v.service;
  const typ = e.type === 'kontakt' ? tt('Kontakt') : e.type === 'creator' ? tt('Creator') : p.kind === 'neu' ? tt('Neu für dich') : '';
  const media = (S.mediaLookup[v.link] && S.mediaLookup[v.link].url) ? [] : (v.media || []).filter(Boolean);
  const showText = v.text && !(v.card && !v.rich && v.text.trim() === v.card.url) && !thinText(v);
  const creator = e.name || v.who;
  const via = viaText(v, creator);
  // Mit Titel: Titel neben dem Creator-Bild, Creator klein darunter – spart eine Zeile
  const tr = typeof uebersetzung === 'function' ? uebersetzung(p, v) : null;  // #97: übersetzte Fassung statt Original
  const titel = tr && tr.title ? tr.title : p.title;
  const tv = tr && tr.text ? Object.assign({}, v, { text: tr.text, rich: false }) : v;
  const uebZ = typeof uebZeile === 'function' ? uebZeile(p, v) : null;
  const artLang = !tr && typeof uebFremd === 'function' ? uebFremd(p) || null : null;  // #97: Sprache am Beitrag, damit „Übersetzen“ im Browser-Menü sie erkennt
  const titled = !!p.title && !(v.video && v.short);
  const goCreator = () => openCreator(v.whoKey);
  const whoPart = titled
    ? [h('button', { type: 'button', class: 'card-av-btn', 'aria-label': tt('Beiträge von ') + creator + ' zeigen', title: tt('Beiträge von ') + creator, onClick: goCreator },
        avatar(Object.assign({}, e, { avatar: v.avatar || e.avatar, name: creator }), 40)),
      h('div', { class: 'card-who' }, h('h1', { class: 'card-title' }, titel),
        h('span', { class: 'card-meta' }, h('button', { type: 'button', class: 'card-creator-link', onClick: goCreator }, creator), [typ, ago(v.date), v.note].filter(Boolean).map((x) => ' · ' + x).join('')))]
    : [h('button', { type: 'button', class: 'card-who-btn', 'aria-label': tt('Beiträge von ') + creator + ' zeigen', title: tt('Beiträge von ') + creator, onClick: goCreator },
        avatar(Object.assign({}, e, { avatar: v.avatar || e.avatar, name: creator }), 40),
        h('span', { class: 'card-who' }, h('b', {}, creator), h('span', { class: 'card-meta' }, [typ, ago(v.date), v.note].filter(Boolean).join(' · '))))];
  const head = h('div', { class: 'card-head' + (titled ? ' titled' : '') },
      ...whoPart);
  const vswitch = p.variants ? h('div', { class: 'variant-switch', role: 'group', 'aria-label': tt('Derselbe Beitrag auf mehreren Diensten – Version wählen') },
        vs.map((x, i) => h('button', { type: 'button', 'aria-pressed': i === vi ? 'true' : 'false', title: tt('Version auf ') + SERVICE_LABEL[x.service] + ' zeigen',
          onClick: () => { S.variantSel[p.id] = i; S.variantPref = x.service; store.set('variantPref', x.service); render(true); } }, SERVICE_LABEL[x.service]))) : null;
  // Varianten (Web/RSS, Mastodon, Bluesky …) unten neben dem Link, eine Zeile – bricht nur bei Bedarf um
  // Herkunft („via …“) unten neben dem Link: eine Zeile, Antippen klappt sie auf
  const viaBtn = h('button', { type: 'button', class: 'card-via' + (S.viaOpen ? ' open' : ''), title: via, 'aria-expanded': S.viaOpen ? 'true' : 'false',
    onClick: () => { S.viaOpen = !S.viaOpen; render(true); } }, via);
  const foot = h('div', { class: 'card-foot' + (vswitch ? ' with-variants' : '') }, isWide() ? h('span', { class: 'foot-acts' }, actButtons(p)) : null, vswitch, viaBtn, postenKnoepfe(p), kartenZusatz(p, 'fuss'),  /* Haken Posten: nur bei Verbindung */
      v.link ? h('a', Object.assign({ href: v.link, title: tt('Auf ') + label + tt(' öffnen') }, EXT), p.variants ? tt('Öffnen ↗') : v.video ? tt('In YouTube öffnen') : v.service === 'rss' ? tt('Artikel öffnen') : tt('Original öffnen')) : null);
  // YouTube Shorts: Hochformat-Player über die volle Kartenhöhe, Text daneben (Laptop) bzw. darunter (Handy)
  if (v.video && v.short) {
    return uebLangSetzen(h('article', { class: 'card short-card' },
      h('div', { class: 'card-body short-body' },
        videoBlock(v, p),
        h('div', { class: 'short-side' }, kartenZusatz(p, 'oben'), head, p.title ? h('h1', {}, titel) : null,
          showText ? h('p', { class: 'card-text video-text' }, richNodes(tv)) : null, uebZ)),
      foot), artLang);
  }
  return uebLangSetzen(h('article', { class: 'card' },
    kartenZusatz(p, 'oben'),
    head,
    h('div', { class: 'card-body' },
      p.title && !titled ? h('h1', {}, titel) : null,
      v.video ? videoBlock(v, p) : null,
      v.ptEmbed && modulAn('peertube') ? peertubeBlock(v, p) : v.medien ? mediaBlock(v) : null,
      v.service === 'rss' && !v.medien && !v.video && v.link && (!showText || thinText(v) || /video|sendung|tagesthemen|tagesschau_20/i.test(v.link)) ? watchBlock(v) : null,
      showText ? clampText(p, tv) : null,
      uebZ,
      media.length ? h('div', { class: 'card-media' + (media.length === 1 ? ' one' : '') }, media.map((src, i) => bildInKarte(v, src, i))) : null,
      linkVideoBlock(v, p) || linkCard(v.card),
      kartenZusatz(p, 'unten'),  // #23: z. B. „Antworten ansehen“
      p.kind === 'neu' ? h('button', { type: 'button', class: 'follow-btn', onClick: () => kfollow(p) }, S.kfollows.some((f) => f.key === p.whoKey) ? tt('In KOMPASS gefolgt ✓') : tt('In KOMPASS folgen')) : null),
    foot), artLang);
}
// #97: Titel und Text tragen die Sprache des Beitrags (Bildschirmleser, „Übersetzen“ im Browser-Menü); Knöpfe bleiben in der App-Sprache
function uebLangSetzen(el, lang) { if (lang) el.querySelectorAll('h1, .card-text').forEach((x) => { x.lang = lang; }); return el; }
function kfollow(p) {
  const i = S.kfollows.findIndex((f) => f.key === p.whoKey);
  if (i >= 0) S.kfollows.splice(i, 1);
  else S.kfollows.push({ key: p.whoKey, name: p.who, avatar: p.avatar, service: p.service, handle: p.handle });
  save('kfollows'); flash(i >= 0 ? tt('Nicht mehr gefolgt.') : tt('In KOMPASS gefolgt – erscheint ab dem nächsten Laden im Feed.')); render(true);
}

// Bildansicht (#38, Modul „bildansicht“): Bild antippen → groß über der App, Antippen zoomt, ✕/Esc/Hintergrund schließt.
// Lädt die volle Auflösung (Bluesky fullsize, Mastodon url), sonst das Vorschaubild. Liegt außerhalb der Bühne: keine Wischgesten.
function bildInKarte(v, src, i) {
  const alt = (v.mediaAlt && v.mediaAlt[i]) || '';
  if (!modulAn('bildansicht')) return h('img', { src, alt, loading: 'lazy', referrerpolicy: 'no-referrer' });
  const gross = (v.mediaGross && v.mediaGross[i]) || src;
  return h('button', { type: 'button', class: 'bild-knopf', 'aria-label': tt('Bild groß anzeigen') + (alt ? ': ' + alt : ''),
    onClick: (e) => { e.stopPropagation(); bildAnsicht(gross, src, alt); } },
    h('img', { src, alt, loading: 'lazy', referrerpolicy: 'no-referrer' }));
}
function bildAnsicht(src, vorschau, alt) {
  const alt0 = document.activeElement;
  const img = h('img', { src: vorschau, alt: alt || tt('Bild'), referrerpolicy: 'no-referrer' });
  if (src && src !== vorschau) { const voll = new Image(); voll.referrerPolicy = 'no-referrer'; voll.onload = () => { img.src = src; }; voll.src = src; }
  const flaeche = h('div', { class: 'bild-flaeche' }, img);
  const zu = h('button', { type: 'button', class: 'bild-zu', 'aria-label': tt('Schließen') }, '✕');
  const el = h('div', { class: 'bild-ansicht', role: 'dialog', 'aria-modal': 'true', 'aria-label': tt('Bildansicht') }, flaeche, zu,
    alt ? h('p', { class: 'bild-alt' }, alt) : null);
  const schliessen = () => { window.removeEventListener('keydown', taste, true); el.remove(); if (alt0 && alt0.focus) alt0.focus(); };
  const taste = (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); schliessen(); } else if (e.key === 'Enter' || e.key === ' ' || e.key === '+' || e.key === '-') { e.preventDefault(); zoom(); } };
  const zoom = (e) => {
    const an = !el.classList.contains('zoom');
    if (an) { const breit = Math.max(img.naturalWidth || 0, img.getBoundingClientRect().width * 2.5); img.style.width = Math.round(breit) + 'px'; }
    else img.style.width = '';
    el.classList.toggle('zoom', an);
    if (an && e) { const r = flaeche.getBoundingClientRect(); flaeche.scrollLeft = (flaeche.scrollWidth - r.width) * ((e.clientX - r.left) / r.width); flaeche.scrollTop = (flaeche.scrollHeight - r.height) * ((e.clientY - r.top) / r.height); }
  };
  img.addEventListener('click', (e) => { e.stopPropagation(); zoom(e); });
  flaeche.addEventListener('click', (e) => { if (e.target === flaeche && !el.classList.contains('zoom')) schliessen(); });
  zu.addEventListener('click', schliessen);
  window.addEventListener('keydown', taste, true);
  document.body.appendChild(el); zu.focus();
  return el;
}
