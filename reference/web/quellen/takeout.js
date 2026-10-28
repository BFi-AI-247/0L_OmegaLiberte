// SPDX-License-Identifier: AGPL-3.0-only
// Quellen – YouTube-Abos aus Google Takeout übernehmen (Issue #67, Modul yt-takeout). Besitzer: Quellen.
// Der Nutzer lädt bei takeout.google.com nur „YouTube und YouTube Music“ → „Abos“ herunter und wählt hier die CSV (oder die ganze ZIP).
// Gelesen wird nur im Browser – nichts geht an unseren Server oder an Google. Danach dieselbe Vorschau wie beim Paket-Import.
function takeoutAn() { return modulAn('yt-takeout'); }

// CSV mit Anführungszeichen (Kommas und "" im Titel) → Zeilen
function takeoutCsvZeilen(text) {
  const zeilen = []; let z = []; let f = ''; let q = false;
  const t = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { z.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; z.push(f); f = ''; if (z.some((x) => x.trim())) zeilen.push(z); z = []; }
    else f += c;
  }
  z.push(f); if (z.some((x) => x.trim())) zeilen.push(z);
  return zeilen;
}
// Zeilen → Kanäle [{ id, titel }]; Kopfzeile deutsch oder englisch, sonst Spalte mit UC…-Kennungen
function takeoutKanaele(text) {
  const zeilen = takeoutCsvZeilen(text); if (!zeilen.length) return [];
  const kopf = zeilen[0].map((x) => x.trim().toLowerCase());
  const istId = (v) => /^UC[\w-]{22}$/.test(String(v || '').trim());
  let iId = kopf.findIndex((x) => /kanal-?id|channel ?id/.test(x));
  let iTitel = kopf.findIndex((x) => /titel|title|name/.test(x));
  let start = 1;
  if (iId < 0) { iId = zeilen[0].findIndex(istId); start = iId >= 0 ? 0 : 1; if (iId < 0 && zeilen[1]) iId = zeilen[1].findIndex(istId); }
  if (iId < 0) return [];
  if (iTitel < 0) iTitel = iId === 2 ? 0 : 2;
  const gesehen = new Set(); const aus = [];
  zeilen.slice(start).forEach((z) => {
    const id = String(z[iId] || '').trim(); if (!istId(id) || gesehen.has(id)) return;
    gesehen.add(id); aus.push({ id, titel: paketSauber(z[iTitel] || '', 80) });
  });
  return aus.slice(0, PAKET_MAX);
}
// ZIP (Takeout) → Text der Abo-CSV. Nur das Nötigste: Zentralverzeichnis lesen, Eintrag entpacken (stored oder deflate).
async function takeoutZipCsv(buf) {
  const d = new DataView(buf); const n = buf.byteLength;
  let e = -1; for (let i = n - 22; i >= Math.max(0, n - 65557); i--) if (d.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error(tt('ZIP-Datei nicht lesbar.'));
  let p = d.getUint32(e + 16, true); const anzahl = d.getUint16(e + 10, true);
  const dec = new TextDecoder();
  for (let k = 0; k < anzahl && p + 46 <= n; k++) {
    if (d.getUint32(p, true) !== 0x02014b50) break;
    const art = d.getUint16(p + 10, true); const groesse = d.getUint32(p + 20, true);
    const ln = d.getUint16(p + 28, true); const lx = d.getUint16(p + 30, true); const lk = d.getUint16(p + 32, true);
    const lokal = d.getUint32(p + 42, true); const name = dec.decode(new Uint8Array(buf, p + 46, ln));
    p += 46 + ln + lx + lk;
    if (!/\.csv$/i.test(name) || !/abo|subscription/i.test(name)) continue;
    const start = lokal + 30 + d.getUint16(lokal + 26, true) + d.getUint16(lokal + 28, true);
    const daten = new Uint8Array(buf, start, groesse);
    if (art === 0) return dec.decode(daten);
    if (art === 8 && typeof DecompressionStream === 'function') {
      const s = new Blob([daten]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(s).text();
    }
    throw new Error(tt('ZIP-Datei nicht lesbar.'));
  }
  throw new Error(tt('In der ZIP-Datei ist keine Abo-Liste (abos.csv / subscriptions.csv).'));
}
async function takeoutDatei(datei) {
  if (!datei) return;
  try {
    if (datei.size > 20000000) throw new Error(tt('Datei zu groß.'));
    const buf = await datei.arrayBuffer();
    const zip = new Uint8Array(buf, 0, 2); const text = zip[0] === 0x50 && zip[1] === 0x4b ? await takeoutZipCsv(buf) : new TextDecoder().decode(buf);
    takeoutVorschau(text);
  } catch (e) { flash(e.message || tt('Datei nicht lesbar.')); }
}
// Kanäle → Paket (JSON) → gewohnte Vorschau mit Häkchen
function takeoutVorschau(text) {
  const k = takeoutKanaele(text);
  if (!k.length) { flash(tt('Keine YouTube-Kanäle in der Datei gefunden.')); return; }
  const pack = { format: '0l.source-pack/1', title: tt('YouTube-Abos'), sources: k.map((x) => ({ kind: 'youtube', title: x.titel, url: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + x.id })) };
  S.add = null;
  paketVorschau(JSON.stringify(pack), tt('Takeout-Datei'));
}
// Block im Reiter YouTube von „Quelle hinzufügen“
function takeoutBlock() {
  if (!takeoutAn()) return null;
  const wahl = h('input', { type: 'file', id: 'k-takeout', accept: '.csv,.zip,text/csv,application/zip', class: 'sr', onChange: (e) => takeoutDatei(e.target.files && e.target.files[0]) });
  return h('details', { class: 'takeout small' },
    h('summary', {}, tt('YouTube-Abos übernehmen (Google Takeout, ohne Anmeldung)')),
    h('ol', {},
      h('li', {}, tt('Öffne '), h('a', Object.assign({ href: 'https://takeout.google.com/' }, EXT), 'takeout.google.com'), tt(', wähle „Auswahl aufheben“ und nur „YouTube und YouTube Music“.')),
      h('li', {}, tt('Unter „Alle YouTube-Daten enthalten“ nur „Abos“ anhaken, exportieren und die ZIP-Datei herunterladen.')),
      h('li', {}, tt('Hier die ZIP-Datei oder die darin liegende abos.csv wählen. Gelesen wird nur auf deinem Gerät.'))),
    wahl, h('label', { for: 'k-takeout', class: 'mini primary takeout-wahl', role: 'button', tabindex: '0',
      onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wahl.click(); } } }, tt('Datei wählen …')));
}
