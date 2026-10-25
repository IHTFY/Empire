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
  const name = part => page.textContent(`#crestPanel-${part} .crest-pad-name`);
  const pad = page.locator('#crestPanel-color .crest-pad');
  assert.match(await pad.getAttribute('class'), /\boff\b/, 'a retired color is not on the grid');
  assert.equal(await name('color'), 'Rust');
  assert.equal(await page.getAttribute('#crestPanel-color [data-value="rust"]', 'aria-pressed'), 'true', 'the retired color stays as a selected swatch');
  await page.click('#crestPanel-color [data-value="deepblue"]');
  assert.match(await value(), /^heater\.deepblue\./);
  assert.equal(await name('color'), 'Deep blue');
  assert.doesNotMatch(await pad.getAttribute('class'), /\boff\b/);
  assert.equal(await page.getAttribute('#crestPanel-color [data-value="rust"]', 'aria-pressed'), 'false');
  // Dragging across the grid picks each color it passes over.
  const center = async key => {
    const box = await page.locator(`#crestPanel-color [data-value="${key}"]`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const from = await center('crimson'), to = await center('lightteal');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  assert.match(await value(), /^heater\.lightteal\./);
  // The arrow keys move around the grid without wrapping.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  assert.match(await value(), /^heater\.deepcyan\./);
  await page.click('#crestPanel-color [data-value="iron"]');
  await page.keyboard.press('ArrowRight');
  assert.match(await value(), /^heater\.iron\./);
  await page.keyboard.press('ArrowUp');
  assert.match(await value(), /^heater\.gray\./);
  // The emblem's color has its own grid, starting on Auto.
  await page.click('#crestTab-ink');
  assert.equal(await page.getAttribute('#crestPanel-ink [data-value="auto"]', 'aria-pressed'), 'true');
  assert.equal(await name('ink'), 'Auto');
  await page.click('#crestPanel-ink [data-value="crimson"]');
  assert.match(await value(), /^heater\.gray\..*\.crimson$/, 'the field keeps its color');
  assert.equal(await name('ink'), 'Red');
  await page.click('#crestPanel-ink [data-value="darkblue"]');
  assert.match(await value(), /\.darkblue$/);
  await page.click('#crestPanel-ink [data-value="auto"]');
  assert.equal((await value()).split('.').length, 6, 'Auto is left out of the saved crest');
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
