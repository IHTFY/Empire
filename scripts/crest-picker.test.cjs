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
  const wheel = page.locator('.crest-wheel');
  assert.equal(await wheel.getAttribute('aria-valuetext'), 'Rust', 'retired color stays on the wheel and selected');
  // The point in the middle of a color's slice, partway into the band.
  const sliceAt = color => page.evaluate(async key => {
    const { COLOR_CHOICES } = await import('/crest.js');
    const wheel = document.querySelector('.crest-wheel');
    const box = wheel.getBoundingClientRect();
    const turn = (Object.keys(COLOR_CHOICES).indexOf(key) + .5) / (+wheel.getAttribute('aria-valuemax') + 1) * 2 * Math.PI;
    const r = box.width / 2 - 8;
    return { x: box.left + box.width / 2 + Math.sin(turn) * r, y: box.top + box.height / 2 - Math.cos(turn) * r };
  }, color);
  const teal = await sliceAt('teal');
  await page.mouse.click(teal.x, teal.y);
  assert.match(await value(), /^heater\.teal\./);
  assert.equal(await page.textContent('.crest-wheel-label'), 'Teal');
  // Dragging the knob around picks each color it passes over.
  const blue = await sliceAt('blue');
  await page.mouse.move(teal.x, teal.y);
  await page.mouse.down();
  await page.mouse.move(blue.x, blue.y, { steps: 6 });
  await page.mouse.up();
  assert.match(await value(), /^heater\.blue\./);
  await wheel.press('ArrowLeft');
  assert.notEqual(await wheel.getAttribute('aria-valuetext'), 'Blue');
  // Coming back to a tab mid-animation still scrolls its chosen tile into view.
  await page.click('#crestTab-emblem');
  await page.click('#crestPanel-emblem [data-value="letter"]');
  await page.click('#crestTab-color');
  await page.click('#crestTab-emblem');
  const inView = await page.evaluate(() => {
    const panel = document.querySelector('#crestPanel-emblem').getBoundingClientRect();
    const tile = document.querySelector('#crestPanel-emblem [data-value="letter"]').getBoundingClientRect();
    return tile.top >= panel.top && tile.bottom <= panel.bottom;
  });
  assert.equal(inView, true, 'chosen emblem shows after switching back');
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
