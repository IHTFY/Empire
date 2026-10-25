/* global document, window, requestAnimationFrame */
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
  const name = part => page.textContent(`#crestPanel-${part} .crest-arch-name`);
  const arch = page.locator('#crestPanel-color .crest-arch');
  // The middle of the arch's band at a hue, and how far that is from the arch's center.
  const ring = (part, hue = 0) => page.evaluate(([part, hue]) => {
    const box = document.querySelector(`#crestPanel-${part} .crest-arch-ring`).getBoundingClientRect();
    const band = document.querySelector(`#crestPanel-${part} .crest-arch-knob`).offsetWidth - 10;
    const r = box.width / 2 - band / 2, turn = ((hue + .5) * 180 / 16 - 90) * Math.PI / 180;
    return { x: box.left + box.width / 2 + r * Math.sin(turn), y: box.top + box.width / 2 - r * Math.cos(turn), r };
  }, [part, hue]);
  const tap = async (part, hue) => { const { x, y } = await ring(part, hue); await page.mouse.click(x, y); };
  assert.match(await arch.getAttribute('class'), /\boff\b/, 'a retired color is not on the arch');
  assert.equal(await name('color'), 'Rust');
  assert.equal(await page.getAttribute('#crestPanel-color [data-value="rust"]', 'aria-pressed'), 'true', 'the retired color stays as a selected swatch');
  await tap('color', 10);
  assert.match(await value(), /^heater\.blue\./, 'from a retired color the arch picks the pure hue');
  assert.equal(await name('color'), 'Blue');
  assert.doesNotMatch(await arch.getAttribute('class'), /\boff\b/);
  assert.equal(await page.getAttribute('#crestPanel-color [data-value="rust"]', 'aria-pressed'), 'false');
  await page.click('#crestPanel-color .crest-tones [data-value="deepblue"]');
  assert.equal(await name('color'), 'Deep blue');
  // A tap in the hollow inside the arch picks nothing.
  const hollow = await ring('color', 8);
  const box = await page.locator('#crestPanel-color .crest-arch-ring').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - hollow.r / 3);
  assert.match(await value(), /^heater\.deepblue\./);
  // A new hue keeps the tone.
  await tap('color', 7);
  assert.match(await value(), /^heater\.deepteal\./);
  // Jumping from one end to the other glides the knob around the arch, not across it.
  await tap('color', 0);
  await page.waitForTimeout(400);
  const glide = page.evaluate(() => new Promise(resolve => {
    const ring = document.querySelector('#crestPanel-color .crest-arch-ring');
    const knob = document.querySelector('#crestPanel-color .crest-arch-knob');
    const out = [], end = performance.now() + 400;
    (function frame() {
      const b = ring.getBoundingClientRect(), k = knob.getBoundingClientRect();
      out.push([k.left + k.width / 2 - b.left - b.width / 2, k.top + k.height / 2 - b.top - b.width / 2]);
      if (performance.now() < end) requestAnimationFrame(frame); else resolve(out);
    })();
  }));
  await tap('color', 15);
  const { r } = await ring('color');
  const points = await glide;
  assert.ok(points.some(([x]) => Math.abs(x) < r / 2), 'the knob was sampled mid-glide');
  points.forEach(([x, y]) => assert.ok(Math.abs(Math.hypot(x, y) - r) < 3, `knob at ${x.toFixed(1)},${y.toFixed(1)} is off the arch`));
  assert.match(await value(), /^heater\.iron\./, 'the grays keep the tone too');
  const panel = await page.evaluate(() => { const el = document.querySelector('#crestPanel-color'); return [el.scrollWidth, el.clientWidth]; });
  assert.ok(panel[0] <= panel[1], `the knob widens the panel to ${panel[0]}px`);
  // Dragging along the arch picks each hue it passes.
  const from = await ring('color', 3), to = await ring('color', 11);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  assert.match(await value(), /^heater\.deepindigo\./);
  // The arrow keys step along the arch without wrapping.
  await page.focus('#crestPanel-color .crest-arch-ring');
  await page.keyboard.press('End');
  assert.match(await value(), /^heater\.iron\./);
  await page.keyboard.press('ArrowRight');
  assert.match(await value(), /^heater\.iron\./);
  await page.keyboard.press('ArrowLeft');
  assert.match(await value(), /^heater\.deeppink\./);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  assert.match(await value(), /^heater\.deepcrimson\./);
  // The emblem's color has its own arch, starting on Auto.
  await page.click('#crestTab-ink');
  assert.equal(await page.getAttribute('#crestPanel-ink [data-value="auto"]', 'aria-pressed'), 'true');
  assert.equal(await name('ink'), 'Auto');
  await page.click('#crestPanel-ink .crest-tones [data-value="crimson"]');
  assert.match(await value(), /^heater\.deepcrimson\..*\.crimson$/, 'the field keeps its color');
  assert.equal(await name('ink'), 'Red');
  await page.click('#crestPanel-ink [data-value="darkcrimson"]');
  assert.match(await value(), /\.darkcrimson$/);
  await page.click('#crestPanel-ink [data-value="auto"]');
  assert.equal((await value()).split('.').length, 6, 'Auto is left out of the saved crest');
  await page.focus('#crestPanel-ink .crest-arch-ring');
  await page.keyboard.press('ArrowLeft');
  assert.match(await value(), /\.crimson$/, 'an arrow from Auto starts at the first hue');
  await page.click('#crestPanel-ink [data-value="auto"]');
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
