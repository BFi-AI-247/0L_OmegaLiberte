// SPDX-License-Identifier: AGPL-3.0-only
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
  if (m.art === 'audio') return h('audio', { class: 'feed-audio', controls: true, preload: autoplay ? 'auto' : 'none', autoplay: !!autoplay, src: m.url });
  return h('video', { class: 'feed-video', controls: true, preload: autoplay ? 'auto' : 'none', autoplay: !!autoplay, playsinline: true, poster: v.thumb || null, src: m.url });
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
  const titled = !!p.title && !(v.video && v.short);
  const goCreator = () => openCreator(v.whoKey);
  const whoPart = titled
    ? [h('button', { type: 'button', class: 'card-av-btn', 'aria-label': tt('Beiträge von ') + creator + ' zeigen', title: tt('Beiträge von ') + creator, onClick: goCreator },
        avatar(Object.assign({}, e, { avatar: v.avatar || e.avatar, name: creator }), 40)),
      h('div', { class: 'card-who' }, h('h1', { class: 'card-title' }, p.title),
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
    return h('article', { class: 'card short-card' },
      h('div', { class: 'card-body short-body' },
        videoBlock(v, p),
        h('div', { class: 'short-side' }, kartenZusatz(p, 'oben'), head, p.title ? h('h1', {}, p.title) : null,
          showText ? h('p', { class: 'card-text video-text' }, richNodes(v)) : null)),
      foot);
  }
  return h('article', { class: 'card' },
    kartenZusatz(p, 'oben'),
    head,
    h('div', { class: 'card-body' },
      p.title && !titled ? h('h1', {}, p.title) : null,
      v.video ? videoBlock(v, p) : null,
      v.ptEmbed && modulAn('peertube') ? peertubeBlock(v, p) : v.medien ? mediaBlock(v) : null,
      v.service === 'rss' && !v.medien && !v.video && v.link && (!showText || thinText(v) || /video|sendung|tagesthemen|tagesschau_20/i.test(v.link)) ? watchBlock(v) : null,
      showText ? clampText(p, v) : null,
      media.length ? h('div', { class: 'card-media' + (media.length === 1 ? ' one' : '') }, media.map((src, i) => bildInKarte(v, src, i))) : null,
      linkCard(v.card),
      p.kind === 'neu' ? h('button', { type: 'button', class: 'follow-btn', onClick: () => kfollow(p) }, S.kfollows.some((f) => f.key === p.whoKey) ? tt('In KOMPASS gefolgt ✓') : tt('In KOMPASS folgen')) : null),
    foot);
}
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
