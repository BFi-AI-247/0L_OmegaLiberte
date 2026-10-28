// Quellen – OPML lesen und schreiben (Feed-Listen anderer Reader). Funktionen von Mistral (M004, Karte A003), geprüft und ergänzt vom Bau-Kern.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

function opml_entcodieren(s) {
  return s.replace(/&#x([0-9a-fA-F]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/g, function (m, hex, dec, ben) {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[ben];
  });
}
function opml_attribute(tag) {
  const erg = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag)) !== null) erg[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return erg;
}
function opmlLesen(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  text = text.replace(/<!--[\s\S]*?-->/g, ''); // Kommentare überspringen (Ergänzung Bau-Kern)
  const liste = [];
  const gesehen = new Set();
  const re = /<outline\b[^>]*>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const a = opml_attribute(m[0]);
    const url = a.xmlurl !== undefined ? opml_entcodieren(a.xmlurl) : '';
    if (!/^https?:\/\//i.test(url)) continue;
    if (gesehen.has(url)) continue;
    gesehen.add(url);
    let titel = a.title !== undefined ? a.title : (a.text !== undefined ? a.text : url);
    if (titel === '') titel = url;
    liste.push({ titel: opml_entcodieren(titel), url: url, seite: a.htmlurl !== undefined ? opml_entcodieren(a.htmlurl) : '' });
  }
  return liste;
}
function opml_maskieren(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function opmlSchreiben(liste) {
  let s = '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>KOMPASS – meine Quellen</title></head>\n<body>\n';
  for (const e of liste) {
    s += '<outline type="rss" text="' + opml_maskieren(e.titel) + '" title="' + opml_maskieren(e.titel) + tt('" xmlUrl="') + opml_maskieren(e.url) + '"';
    if (e.seite) s += tt(' htmlUrl="') + opml_maskieren(e.seite) + '"';
    s += '/>\n';
  }
  s += '</body>\n</opml>\n';
  return s;
}

/* ---------- Einbindung in KOMPASS ---------- */
// Import: Datei wählen → neue Feeds übernehmen (Dubletten übersprungen) → einmal neu laden
function opmlImport() {
  const inp = h('input', { type: 'file', accept: '.opml,.xml,text/xml,text/x-opml,application/xml', style: 'display:none' });
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    const liste = opmlLesen(await f.text());
    const da = new Set(settings.feeds.map((x) => x.url));
    const neu = liste.filter((x) => !da.has(x.url)).slice(0, 300);
    if (!liste.length) { flash(tt('In dieser Datei habe ich keine Feeds gefunden.')); return; }
    neu.forEach((x) => settings.feeds.push({ id: hashId(x.url), url: x.url, title: shortTitle(x.titel), kind: /youtube\.com\/feeds\//.test(x.url) ? 'youtube' : 'rss', icon: '', site: x.seite || '' }));
    save('settings');
    flash(neu.length ? neu.length + tt(' Feeds übernommen') + (liste.length > neu.length ? ', ' + (liste.length - neu.length) + ' waren schon da' : '') + tt(' – lade neu …') : tt('Alle ') + liste.length + tt(' Feeds sind schon dabei.'));
    render(); if (neu.length) loadAll();
  });
  document.body.appendChild(inp); inp.click();
}
// Export: eigene Feeds plus Mastodon/Bluesky-Konten, denen nur in KOMPASS gefolgt wird (als deren öffentliche Feeds)
function opmlExport() {
  const liste = settings.feeds.map((f) => ({ titel: f.title || f.url, url: f.url, seite: f.site || '' }));
  S.kfollows.forEach((k) => {
    const m = /^m:([^@]+)@(.+)$/.exec(k.key || ''); const b = /^b:(.+)$/.exec(k.key || '');
    if (m) liste.push({ titel: k.name || k.handle, url: 'https://' + m[2] + '/@' + m[1] + '.rss', seite: 'https://' + m[2] + '/@' + m[1] });
    else if (b) liste.push({ titel: k.name || k.handle, url: 'https://bsky.app/profile/' + b[1] + '/rss', seite: 'https://bsky.app/profile/' + b[1] });
  });
  if (!liste.length) { flash(tt('Noch keine eigenen Quellen zum Exportieren.')); return; }
  const url = URL.createObjectURL(new Blob([opmlSchreiben(liste)], { type: 'text/x-opml' }));
  const a = h('a', { href: url, download: 'kompass-quellen.opml', style: 'display:none' });
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  flash(liste.length + tt(' Quellen exportiert (kompass-quellen.opml).'));
}
