/* End-to-end smoke test: import the sample order, walk every screen, screenshot each,
 * and print-to-PDF to verify the physical sheet. Run: node e2e-check.mjs <outDir> */
import { chromium } from 'playwright';

const out = process.argv[2] ?? '.';
const base = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

// fresh state
await page.goto(`${base}/#/`);
await page.evaluate(() => indexedDB.deleteDatabase('thiiroo-dashboard'));

// 1. import via the dev sample hook
await page.goto(`${base}/?sample=1#/p/instant-photo-prints/queue`);
await page.waitForSelector('.qrow', { timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/e2e-1-queue.png` });
const row = await page.textContent('.qrow');
console.log('QUEUE ROW:', row?.slice(0, 120));

// 2. review screen
await page.dblclick('.qrow');
await page.waitForSelector('.crop-frame', { timeout: 15000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/e2e-2-review.png` });

// approve all & continue
await page.click('button:has-text("Approve all")');
await page.waitForTimeout(700);

// 3. print layout
await page.goto(`${base}/#/p/instant-photo-prints/print`);
await page.waitForSelector('.sheet-canvas .sheet', { timeout: 15000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/e2e-3-print-layout.png` });

// 4. batch print
await page.goto(`${base}/#/p/instant-photo-prints/print-batch`);
await page.waitForSelector('.batch-page .sheet', { timeout: 15000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/e2e-4-batch.png` });

// 5. mount print job and export real PDF through the print stylesheet
await page.goto(`${base}/?printtest=1#/p/instant-photo-prints/print-batch`);
await page.waitForSelector('.print-root .sheet', { state: 'attached', timeout: 15000 });
await page.waitForTimeout(1200);
await page.pdf({ path: `${out}/e2e-5-sheet.pdf`, preferCSSPageSize: true, printBackground: true });
console.log('PDF exported');

// 6. dark theme queue
await page.goto(`${base}/#/p/instant-photo-prints/queue`);
await page.waitForSelector('.qrow', { timeout: 15000 });
await page.keyboard.press('Control+Shift+L');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/e2e-6-queue-dark.png` });

await browser.close();
console.log('E2E DONE');
