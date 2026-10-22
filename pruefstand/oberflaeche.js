// SPDX-License-Identifier: AGPL-3.0-only
// UI smoke test of the reference app: start, welcome in three steps, add a catalog source, open settings —
// light and dark, phone 412 px and laptop 1400 px. Screenshots go to pruefstand/shots/ (git-ignored).
//   php -S localhost:8000 -t reference/web &
//   npm i playwright@1.56.0 && node pruefstand/oberflaeche.js        (BASE=… CHROMIUM=… optional)
// Interface is German by default (locale de-DE), so the labels below are German.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
const OUT = process.env.OUT || __dirname + '/shots';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ergebnis = [];
  for (const [geraet, vp] of [['handy', { width: 412, height: 915 }], ['laptop', { width: 1400, height: 900 }]]) {
    for (const schema of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: schema, locale: 'de-DE', isMobile: geraet === 'handy', hasTouch: geraet === 'handy' });
      const page = await ctx.newPage();
      const fehler = [], fremd = [], rss = [];
      page.on('pageerror', (e) => fehler.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') fehler.push('console: ' + m.text().slice(0, 160)); });
      page.on('request', (r) => { const u = r.url(); if (/digifil|goatcounter|zgo\.at/.test(u)) fremd.push(u); });
      page.on('response', (r) => { if (r.url().includes('api/rss.php')) rss.push(r.status()); });
      const name = geraet + '-' + schema;
      const schritt = async (was, fn) => {
        try { await fn(); ergebnis.push([name, was, 'ok']); }
        catch (e) { ergebnis.push([name, was, 'FEHLER: ' + e.message.split('\n')[0].slice(0, 140)]); }
      };
      await schritt('Start', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await page.waitForSelector('#app *');
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const titel = await page.title();
        if (titel !== 'Kompass~OmegaLiberte') throw new Error('Titel ' + titel);
        ergebnis.push([name, 'Hintergrund', bg]);
        await page.screenshot({ path: `${OUT}/${name}-1-start.png` });
      });
      // Willkommen in drei Schritten: Sprache/Name/Speicher → Themenpakete → KI und Start
      await schritt('Willkommen: drei Schritte bis „Los geht’s“', async () => {
        await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        await page.screenshot({ path: `${OUT}/${name}-1a-schritt2.png` });
        await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        await page.getByRole('button', { name: /^(Los geht’s|Mit Nachrichten starten)$/ }).click();
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/${name}-1b-hauptansicht.png` });
      });
      await schritt('Quelle aus dem Katalog hinzufügen', async () => {
        await page.evaluate(() => openAdd('katalog'));
        await page.getByRole('dialog', { name: 'Quelle hinzufügen' }).waitFor();
        await page.getByRole('tab', { name: 'Katalog' }).click();
        const knopf = page.getByRole('dialog').getByRole('button', { name: 'Hinzufügen', exact: true }).first();
        await knopf.click();
        await page.getByRole('dialog').getByRole('button', { name: '✓ Dabei' }).first().waitFor({ timeout: 5000 });
        await page.screenshot({ path: `${OUT}/${name}-2-katalog.png` });
        const gespeichert = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kompass')).join(','));
        ergebnis.push([name, 'localStorage', gespeichert]);
        await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/${name}-3-nach-hinzufuegen.png` });
      });
      await schritt('Einstellungen öffnen', async () => {
        await page.locator('[aria-label="Einstellungen"]:visible').first().click();
        await page.waitForTimeout(400);
        const txt = await page.locator('#app').innerText();
        if (!/Datenschutz|Speicher|Sprache/.test(txt)) throw new Error('Einstellungen nicht sichtbar');
        // erlaubt: digifil.de als Ziel des freiwilligen Zero-Ledger-Pings (instanz.js „ping“) – sonst nirgends
        if (txt.split(/(?<=[.!?])\s+/).filter((s) => !/Zero Ledger/.test(s)).join(' ').includes('digifil')) throw new Error('Text nennt noch digifil');
        await page.getByText('Datenschutz', { exact: false }).last().scrollIntoViewIfNeeded().catch(() => {});
        await page.screenshot({ path: `${OUT}/${name}-5-datenschutz.png` });
        if (txt.includes('GoatCounter')) throw new Error('Text nennt GoatCounter, obwohl aus');
        await page.screenshot({ path: `${OUT}/${name}-4-einstellungen.png`, fullPage: false });
      });
      ergebnis.push([name, 'Seitenfehler', fehler.length ? fehler.join(' | ') : 'keine']);
      ergebnis.push([name, 'Aufrufe digifil/GoatCounter', fremd.length ? fremd.join(' ') : 'keine']);
      ergebnis.push([name, 'rss.php-Antworten', rss.join(',') || '–']);
      await ctx.close();
    }
  }
  await browser.close();
  console.log('| Lauf | Schritt | Ergebnis |\n|---|---|---|');
  for (const z of ergebnis) console.log('| ' + z.join(' | ') + ' |');
})();
