/* global document, window */
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.join(__dirname, '../public');

test('The crest editor switches tabs and applies each choice', async t => {
  const server = createServer(async (req, res) => {
    try {
      const name = new URL(req.url, 'http://x').pathname;
      let body = await readFile(path.join(root, name === '/' ? 'index.html' : name));
      if (name === '/') body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': type }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  // A saved crest wearing the retired "rust" color.
  await page.evaluate(() => localStorage.setItem('crest', 'heater.rust.plain.dragon.gold.basic'));
  await page.evaluate(async () => {
    const { createCrestPicker } = await import('/crest-picker.js');
    document.querySelectorAll('.screen').forEach(el => el.hidden = el.id !== 'setup');
    window.picker = createCrestPicker({ getRoom: () => ({ users: {} }), getUid: () => 'p0' });
    document.querySelector('#crestButton').click();
  });
  const value = () => page.evaluate(() => window.picker.value());
  assert.equal(await page.locator('#crestPanel-emblem').isVisible(), true);
  await page.click('#crestPanel-emblem [data-value="lion"]');
  assert.match(await value(), /\.lion\./);
  assert.equal(await page.getAttribute('#crestPanel-emblem [data-value="lion"]', 'aria-pressed'), 'true');
  await page.click('#crestTab-color');
  assert.equal(await page.locator('#crestPanel-emblem').isVisible(), false);
  assert.equal(await page.getAttribute('#crestPanel-color [data-value="rust"]', 'aria-pressed'), 'true', 'retired color stays shown and selected');
  await page.click('#crestPanel-color [data-value="teal"]');
  assert.match(await value(), /^heater\.teal\./);
  assert.equal(await page.textContent('.crest-ring-label'), 'Teal');
  await page.click('#crestTab-trim');
  await page.click('#crestPanel-trim [data-value="riveted"]');
  await page.click('#crestPanel-trim [data-value="silver"]');
  assert.match(await value(), /\.silver\.riveted$/);
  await page.click('#crestShuffle');
  await page.click('#crestTab-shape');
  const shape = (await value()).split('.')[0];
  assert.equal(await page.getAttribute(`#crestPanel-shape [data-value="${shape}"]`, 'aria-pressed'), 'true');
  assert.equal(await page.locator('#crestPanel-shape [aria-pressed="true"]').count(), 1);
  assert.deepEqual(errors, []);
});
