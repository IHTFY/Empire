/* global document, window, innerWidth, innerHeight, getComputedStyle, requestAnimationFrame */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '../public');

// The shared loader, stubbed: it fills a box with an empty unit of the size the box asks for.
const loaderStub = `window.ihtfyAds = {
  adFree: async () => false,
  show(box, key) {
    const [width, height] = box.dataset.adSize.split('x');
    const ad = document.createElement('ins');
    ad.className = 'adsbygoogle';
    ad.style.cssText = 'display:inline-block;width:' + width + 'px;height:' + height + 'px';
    box.append(ad);
    (window.shown ??= []).push([box.dataset.adSize, key]);
  }
};`;

// Where the ad box sits, in viewport pixels, and how far it is from every visible control.
const measure = () => {
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const box = rect(document.querySelector('#homeAdBox'));
  const page = document.querySelector('.home-page');
  const controls = [...document.querySelectorAll('.home-page a[href], .home-page button, .home-page input')]
    .filter(el => el.offsetWidth && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]'))
    .map(el => ({ name: el.id || el.textContent.trim() || el.className, rect: rect(el) }));
  const distance = r => Math.hypot(Math.max(r.left - box.right, box.left - r.right, 0), Math.max(r.top - box.bottom, box.top - r.bottom, 0));
  return {
    box, width: box.right - box.left, height: box.bottom - box.top,
    size: document.querySelector('#homeAdBox').dataset.adSize,
    submit: rect(document.querySelector('#roomSubmit')),
    link: rect(document.querySelector('#homeAd a')),
    gaps: controls.map(c => ({ name: c.name, gap: Math.round(distance(c.rect)) })).filter(c => c.gap < 1000),
    hero: document.querySelector('.hero').clientHeight,
    scroll: [page.scrollWidth - page.clientWidth, page.scrollHeight - page.clientHeight, document.scrollingElement.scrollHeight - innerHeight],
    viewport: [innerWidth, innerHeight]
  };
};

test('Home carries one ad after a finished round, in view and clear of every control', async t => {
  const server = createServer(async (request, response) => {
    try {
      const name = new URL(request.url, 'http://localhost').pathname;
      let body = await readFile(path.join(root, name === '/' ? 'index.html' : name));
      if (name === '/') body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html';
      response.writeHead(200, { 'Content-Type': type }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;

  // A fresh page for each size, as on a real visit: Home has its ad from its first paint.
  const visit = async ([width, height], finishedRound = true) => {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.route('https://ihtfy.com/ads/v1.js', route => route.fulfill({ contentType: 'text/javascript', body: loaderStub }));
    await page.goto(url);
    await page.evaluate(async finishedRound => {
      await document.fonts.ready;
      if (finishedRound) sessionStorage.setItem('finishedRound', 'room/round-1');
      // The form as the app builds it: home.js sizes the create/join panel.
      const { createHome } = await import('/home.js');
      createHome({ db: {}, ensureSignedIn() {}, enterRoom() {}, setRoomInUrl() {}, ui: { show() {}, toast() {} } });
      const { showHomeAd, refitHomeAd } = await import('/ads.js');
      window.addEventListener('resize', () => refitHomeAd(document.querySelector('#homeAd'), document.querySelector('#homeAdBox')));
      showHomeAd(document.querySelector('#homeAd'), document.querySelector('#homeAdBox'));
    }, finishedRound);
    return page;
  };

  const expected = [
    [[360, 640], '320x50'],
    [[390, 750], '320x100'],
    [[412, 800], '320x100'],
    [[1280, 800], '300x250'],
    [[320, 568], '320x50']
  ];
  for (const [viewport, size] of expected) {
    await t.test(`${viewport.join(' × ')} gets a ${size} box in view`, async () => {
      const page = await visit(viewport);
      await page.waitForFunction(() => window.shown?.length);
      const before = await page.evaluate(measure);
      // The entry animations (the form rising into place) end; the layout must not change after.
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).map(a => a.finished)));
      const after = await page.evaluate(measure);
      await page.close();
      const [width, height] = size.split('x').map(Number);
      const label = JSON.stringify(after);
      assert.equal(after.size, size, label);
      assert.deepEqual([after.width, after.height], [width, height], label);
      for (const r of [after.box, after.submit, after.link]) {
        assert(r.left >= 0 && r.top >= 0 && r.right <= after.viewport[0] && r.bottom <= after.viewport[1], `in view: ${label}`);
      }
      assert.deepEqual(after.scroll, [0, 0, 0], label);
      assert(after.hero >= 40, label);
      assert(after.box.top - after.submit.bottom >= 50, `gap to the Create button: ${label}`);
      assert(after.link.top - after.box.bottom >= 50, `gap to the Privacy link: ${label}`);
      for (const control of after.gaps) assert(control.gap >= 50, `${control.name} is ${control.gap}px from the box: ${label}`);
      assert.deepEqual(after.box, before.box, 'the box does not move once it has been placed');
      console.log(`    ${viewport.join('x')}: ${size} box ${JSON.stringify(after.box)}, ${Math.round(after.box.top - after.submit.bottom)}px below the button, ${Math.round(after.link.top - after.box.bottom)}px above the link, hero ${after.hero}px`);
    });
  }

  await t.test('a window too short for the smallest box gets no box and no request', async () => {
    for (const viewport of [[667, 375], [480, 280]]) {
      const page = await visit(viewport);
      await page.waitForTimeout(200);
      const result = await page.evaluate(() => ({ hidden: document.querySelector('#homeAd').hidden, shown: window.shown?.length ?? 0, size: document.querySelector('#homeAdBox').dataset.adSize ?? null }));
      await page.close();
      assert.deepEqual(result, { hidden: true, shown: 0, size: null }, viewport.join('x'));
    }
  });

  await t.test('before a finished round, Home has no box and nothing loads', async () => {
    const page = await visit([390, 750], false);
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => ({ hidden: document.querySelector('#homeAd').hidden, loader: [...document.scripts].some(s => s.src.includes('ads/v1.js')) }));
    await page.close();
    assert.deepEqual(result, { hidden: true, loader: false });
  });

  await t.test('turning to a window too short for the box takes it down, and turning back brings no second', async () => {
    const page = await visit([390, 750]);
    await page.waitForFunction(() => window.shown?.length);
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForFunction(() => document.querySelector('#homeAd').hidden);
    const result = await page.evaluate(() => ({ ads: document.querySelectorAll('ins.adsbygoogle').length, shown: window.shown.length }));
    await page.setViewportSize({ width: 390, height: 750 });
    await page.waitForTimeout(200);
    const back = await page.evaluate(() => ({ hidden: document.querySelector('#homeAd').hidden, shown: window.shown.length }));
    await page.close();
    assert.deepEqual(result, { ads: 0, shown: 1 });
    assert.deepEqual(back, { hidden: true, shown: 1 });
  });

  await t.test('coming back to Home from a room keeps the form whole, so the size chosen still fits', async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce' });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.route('https://ihtfy.com/ads/v1.js', route => route.fulfill({ contentType: 'text/javascript', body: loaderStub }));
    await page.goto(url);
    const result = await page.evaluate(async () => {
      const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100))));
      const { createHome } = await import('/home.js');
      createHome({ db: {}, ensureSignedIn() {}, enterRoom() {}, setRoomInUrl() {}, ui: { show() {}, toast() {} } });
      await frames();
      const panel = document.querySelector('.mode-extra');
      const before = panel.style.height;
      // A room is open: Home is hidden while it is.
      document.querySelector('#homeScreen').hidden = true;
      await frames();
      document.querySelector('#homeScreen').hidden = false;
      const atReturn = panel.style.height;
      sessionStorage.setItem('finishedRound', 'room/round-1');
      const { showHomeAd } = await import('/ads.js');
      showHomeAd(document.querySelector('#homeAd'), document.querySelector('#homeAdBox'));
      await frames();
      const form = document.querySelector('#roomForm');
      return { before, atReturn, size: document.querySelector('#homeAdBox').dataset.adSize,
        scroll: form.scrollHeight - form.clientHeight, hero: document.querySelector('.hero').clientHeight };
    });
    await page.close();
    assert(parseInt(result.before) > 0, JSON.stringify(result));
    assert.equal(result.atReturn, result.before, JSON.stringify(result));
    assert(result.size, JSON.stringify(result));
    assert(result.scroll <= 1 && result.hero >= 40, JSON.stringify(result));
  });
});
