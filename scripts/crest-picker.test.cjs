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
  // Tapping the shield's emblem or field opens that part's options.
  const big = await page.locator('#crestBig').boundingBox();
  await page.mouse.click(big.x + big.width / 2, big.y + big.height / 2);
  assert.equal(await page.getAttribute('#crestTab-emblem', 'aria-selected'), 'true');
  await page.mouse.click(big.x + big.width * .2, big.y + big.height * .4);
  assert.equal(await page.getAttribute('#crestTab-color', 'aria-selected'), 'true');
  assert.equal(await page.locator('#crestPanel-emblem').isVisible(), false);
  const wheel = page.locator('.crest-wheel');
  assert.equal(await wheel.getAttribute('aria-valuetext'), 'None', 'a retired color is not on the wheel');
  assert.equal(await page.getAttribute('#crestPanel-color [data-value="rust"]', 'aria-pressed'), 'true', 'the retired color stays as a selected swatch');
  // The point on the wheel's band at a given step round from the top.
  const stepAt = step => page.evaluate(step => {
    const wheel = document.querySelector('.crest-wheel');
    const box = wheel.getBoundingClientRect();
    const turn = step / (+wheel.getAttribute('aria-valuemax') + 1) * 2 * Math.PI;
    const r = box.width / 2 - 8;
    return { x: box.left + box.width / 2 + Math.sin(turn) * r, y: box.top + box.height / 2 - Math.cos(turn) * r };
  }, step);
  // Going round the wheel, the colors run in hue order, each one once.
  const steps = +await wheel.getAttribute('aria-valuemax') + 1;
  const hues = [];
  for (let step = 0; step < steps; step++) {
    const point = await stepAt(step);
    await page.mouse.click(point.x, point.y);
    assert.equal(await wheel.getAttribute('aria-valuenow'), String(step));
    hues.push(await page.evaluate(async color => {
      const { PART_OPTIONS } = await import('/crest.js');
      const [r, g, b] = [1, 3, 5].map(i => parseInt(PART_OPTIONS.color[color].hex.slice(i, i + 2), 16));
      const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h * 60;
    }, (await value()).split('.')[1]));
  }
  if (hues[0] > 300) hues[0] -= 360;
  assert.deepEqual([...hues].sort((a, b) => a - b), hues, `hues in order: ${hues.map(Math.round)}`);
  // Dragging the knob around picks each color it passes over.
  const from = await stepAt(3), to = await stepAt(7);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  assert.equal(await wheel.getAttribute('aria-valuenow'), '7');
  await wheel.press('ArrowLeft');
  assert.equal(await wheel.getAttribute('aria-valuenow'), '6');
  assert.equal(await page.textContent('.crest-wheel-label'), await wheel.getAttribute('aria-valuetext'));
  await page.click('#crestPanel-color [data-value="sable"]');
  assert.match(await value(), /^heater\.sable\./);
  assert.equal(await wheel.getAttribute('aria-valuetext'), 'None');
  assert.equal(await page.textContent('.crest-wheel-label'), 'Black');
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
