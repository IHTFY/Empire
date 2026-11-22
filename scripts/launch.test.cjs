/* global document, window, Element, dispatchEvent, PointerEvent */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '../public');

// Playwright can't open a page as an installed app, so the head script's display-mode query answers yes.
const installed = () => {
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => query.includes('display-mode') ? { matches: true, media: query } : matchMedia(query);
};

// Slow every animation and timer tenfold, so a step surely lands during the exit even on a loaded machine.
const slow = () => {
  const setTimeout = window.setTimeout;
  window.setTimeout = (callback, delay, ...args) => setTimeout(callback, delay * 10, ...args);
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const animation = animate.call(this, keyframes, options);
    animation.playbackRate = 0.1;
    return animation;
  };
};

// Home with only the launch scripts: the Sound button counts its clicks instead of opening its dialog.
test('a tap or key during the installed launch only skips it', async t => {
  const server = createServer(async (request, response) => {
    try {
      const name = new URL(request.url, 'http://localhost').pathname;
      let body = await readFile(path.join(root, name === '/' ? 'index.html' : name));
      if (name === '/') body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, script => script.includes('launch') ? script : '');
      const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html';
      response.writeHead(200, { 'Content-Type': type }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;

  const launch = async options => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ...options });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.addInitScript(installed);
    await page.addInitScript(slow);
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('launch-icon')?.getAnimations().length > 0);
    await page.evaluate(() => {
      window.clicks = 0;
      document.querySelector('#homeScreen .sound-btn').addEventListener('click', () => window.clicks++);
    });
    return page;
  };
  const ended = page => page.waitForFunction(() => !document.getElementById('launch') && !document.documentElement.classList.contains('launching'), null, { timeout: 5000 });

  await t.test('a touch reaches nothing behind the copy, and the next touch works', async () => {
    const page = await launch({ hasTouch: true, isMobile: true });
    const box = await page.locator('#homeScreen .sound-btn').boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('#launch')?.id, [x, y]), 'launch');
    await page.touchscreen.tap(x, y);
    await ended(page);
    // A click that would reach the button comes right after the tap.
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.clicks), 0);
    await page.touchscreen.tap(x, y);
    await page.waitForFunction(() => window.clicks === 1, null, { timeout: 2000 });
    await page.close();
  });

  await t.test('a touch that starts on the copy is canceled, so it makes no click at all', async () => {
    const page = await launch({ hasTouch: true, isMobile: true });
    const box = await page.locator('#homeScreen .sound-btn').boundingBox();
    // Runs after the copy's own listener, so it sees whether that canceled the touch.
    await page.evaluate(() => document.getElementById('launch').addEventListener('touchstart', event => { window.canceled = event.defaultPrevented; }));
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await ended(page);
    assert.equal(await page.evaluate(() => window.canceled), true);
    await page.close();
  });

  await t.test('a touch that makes no click leaves the next touch working', async () => {
    const page = await launch({ hasTouch: true, isMobile: true });
    const box = await page.locator('#homeScreen .sound-btn').boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    // A press with no click after it, as when the browser drops a touch's click.
    await page.evaluate(() => dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 })));
    await ended(page);
    // A keyboard's click is not the touch's, so the guard lets it through.
    await page.focus('#homeScreen .sound-btn');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.clicks), 1);
    // The guard's own timeout runs tenfold here, so only the next press can drop it.
    await page.touchscreen.tap(x, y);
    await page.waitForFunction(() => window.clicks === 2, null, { timeout: 2000 });
    await page.close();
  });

  await t.test('a mouse click reaches nothing behind the copy, and the next click works', async () => {
    const page = await launch();
    const box = await page.locator('#homeScreen .sound-btn').boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.click(x, y);
    await ended(page);
    assert.equal(await page.evaluate(() => window.clicks), 0);
    // Well inside the second a touch's click would be waited for.
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.clicks === 1, null, { timeout: 2000 });
    await page.close();
  });

  await t.test('a click alone, as from a screen reader, reaches nothing behind the copy', async () => {
    const page = await launch();
    await page.evaluate(() => document.querySelector('#homeScreen .sound-btn').click());
    await ended(page);
    assert.equal(await page.evaluate(() => window.clicks), 0);
    await page.close();
  });

  await t.test('a key reaches nothing behind the copy', async () => {
    const page = await launch();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await ended(page);
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
    assert.equal(await page.evaluate(() => window.clicks), 0);
    await page.close();
  });
});
