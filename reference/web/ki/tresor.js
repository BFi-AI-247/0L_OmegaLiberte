// SPDX-License-Identifier: AGPL-3.0-only
// KI – Tresor: Zugangsschlüssel verschlüsselt (AES-GCM) in IndexedDB, nur auf diesem Gerät (Schutzregeln siehe Kopf von ki/ki.js). Besitzer: KI-Modus. Teil von KOMPASS (aus ki/ki.js geteilt, #88).
// Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.
'use strict';

/* ---------- Tresor: verschlüsselte Schlüssel in IndexedDB ---------- */
function kiDb() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('kompass-tresor' + (INSTANZ.speicher ? '-' + INSTANZ.speicher : ''), 1);
    r.onupgradeneeded = () => r.result.createObjectStore('v');
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  });
}
async function kiIdb(mode, fn) {
  const db = await kiDb();
  return new Promise((ok, fail) => {
    const tx = db.transaction('v', mode); const st = tx.objectStore('v');
    const req = fn(st); tx.oncomplete = () => ok(req && req.result); tx.onerror = () => fail(tx.error);
  });
}
async function kiGeraeteSchluessel() {
  let k = await kiIdb('readonly', (st) => st.get('geraet'));
  if (!k) {
    k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await kiIdb('readwrite', (st) => st.put(k, 'geraet'));
  }
  return k;
}
async function kiKeySpeichern(art, klar) {
  const k = await kiGeraeteSchluessel();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(klar));
  await kiIdb('readwrite', (st) => st.put({ iv, ct, at: Date.now() }, 'key:' + art));
  KI.keys[art] = klar;
}
async function kiKeyLaden(art) {
  try {
    const rec = await kiIdb('readonly', (st) => st.get('key:' + art));
    if (!rec) return '';
    const k = await kiGeraeteSchluessel();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, k, rec.ct);
    return (KI.keys[art] = new TextDecoder().decode(pt));
  } catch (e) { return ''; }
}
async function kiKeyLoeschen(art) {
  delete KI.keys[art];
  try { await kiIdb('readwrite', (st) => st.delete('key:' + art)); } catch (e) { /* egal */ }
}
async function kiTresorLeeren() { KI.keys = {}; try { indexedDB.deleteDatabase('kompass-tresor' + (INSTANZ.speicher ? '-' + INSTANZ.speicher : '')); } catch (e) { /* egal */ } }

