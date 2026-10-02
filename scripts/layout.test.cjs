/* global document, window, requestAnimationFrame, innerWidth, innerHeight, scrollX, scrollY */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '../public');
const sizes = [[320,568], [390,844], [390,400], [480,280], [568,320], [640,360], [667,375], [844,390], [932,430], [1024,600], [768,1024], [1440,900], [2560,1440]];

test('Every game screen contains its panels and scrolls only inside them', async t => {
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
  const page = await browser.newPage({ reducedMotion: 'reduce', hasTouch: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const { createLobby } = await import('/lobby/render.js');
    const { fitRevealText } = await import('/reveal.js');
    window.fitRevealText = fitRevealText;
    window.room = { id: 'layout', state: 'waiting', users: {}, presence: {} };
    window.lobby = createLobby({ getRoom: () => window.room, getUid: () => 'p0', ui: { rollNumber: (el, n) => el.textContent = n, toast: () => {} }, isRevealing: () => false });
    document.querySelectorAll('.room-name').forEach(el => el.textContent = 'Silver Senate');
    document.querySelector('#roomPassRow').hidden = false;
    document.querySelector('#roomPassText').textContent = 'ABCDEF';
    window.showScreen = id => document.querySelectorAll('.screen, .reveal').forEach(el => el.hidden = el.id !== id);
    window.populate = (count, watchers) => {
      window.room.users = Object.fromEntries(Array.from({ length: count }, (_, i) => ['p' + i, { real: 'Player ' + i, clan: 'Player', fakeBadge: i > 0 }]));
      window.room.presence = Object.fromEntries([...Array.from({ length: count }, (_, i) => ['p' + i, { online: true }]), ...Array.from({ length: watchers }, (_, i) => ['w' + i, { online: true, name: 'Watching guest ' + i }])]);
      window.lobby.render();
    };
  });
  const contains = async (selector, label) => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bounds = await page.locator(selector).evaluate(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight };
    });
    assert(bounds.x >= -1 && bounds.y >= -1 && bounds.right <= bounds.vw + 1 && bounds.bottom <= bounds.vh + 1 && bounds.width > 0 && bounds.height > 0, `${label}: ${JSON.stringify(bounds)}`);
  };
  const noPageScroll = async () => {
    const result = await page.evaluate(() => {
      window.scrollTo(1000,1000);
      return { x: scrollX, y: scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight };
    });
    assert(result.x === 0 && result.y === 0 && result.width <= result.vw && result.height <= result.vh, JSON.stringify(result));
  };
  for (const [width,height] of sizes) {
    await t.test(`${width} × ${height}`, async () => {
      await page.setViewportSize({ width,height });
      for (const id of ['homeScreen', 'setupScreen']) {
        await page.evaluate(id => window.showScreen(id), id);
        // Validation messages must remain reachable without growing the screen.
        await page.evaluate(() => document.querySelectorAll('.field-error').forEach(el => el.textContent = 'Please enter a valid name before continuing.'));
        await contains('#' + id, id);
        await contains('#' + id + ' > .bar', id + ' toolbar');
        if (id === 'setupScreen') await contains('.setup-intro', 'setup introduction');
        if (id === 'homeScreen') {
          for (const selector of ['.hero-logo', '.hero-title', '.hero-tagline']) {
            if (await page.locator(selector).isVisible()) await contains(selector, selector);
          }
        }
        const panel = id === 'homeScreen' ? '#roomForm' : '#namesForm';
        await contains(panel, id + ' form');
        await page.locator(panel).evaluate(el => el.scrollTop = el.scrollHeight);
        await contains(id === 'homeScreen' ? '#roomSubmit' : '#submitNames', id + ' submit after inner scroll');
        await noPageScroll();
      }
      await page.evaluate(() => window.showScreen('lobbyScreen'));
      for (const [players, watchers] of [[2,0], [11,3], [30,15]]) {
        await page.evaluate(([n,w]) => window.populate(n,w), [players, watchers]);
        await contains('#tableView', 'table');
        await contains('#revealSecrets', 'reveal button');
        await contains('#lobbyScreen > .bar', 'lobby toolbar');
        if (watchers) await contains('#watching', 'watchers');
        const table = await page.evaluate(() => {
          const stage = document.querySelector('.lobby-body').getBoundingClientRect();
          const r = document.querySelector('#tableView').getBoundingClientRect();
          return { size: r.width, expected: Math.min(stage.width,stage.height,1100), y: r.y, bottom: r.bottom, top: stage.y, limit: stage.bottom };
        });
        assert(Math.abs(table.size-table.expected) < 2 && table.y >= table.top-1 && table.bottom <= table.limit+1, JSON.stringify(table));
        await noPageScroll();
      }
      await page.evaluate(() => { document.querySelector('#tableView').hidden = true; document.querySelector('#listView').hidden = false; document.querySelector('#listSummary').hidden = false; });
      await contains('#listView', 'player list border');
      await page.locator('#nameList').evaluate(el => el.scrollTop = el.scrollHeight);
      await contains('#nameList > :last-child', 'last player after inner scroll');
      await noPageScroll();
      await page.evaluate(() => { document.querySelector('#tableView').hidden = false; document.querySelector('#listView').hidden = true; document.querySelector('#listSummary').hidden = true; });
      for (const id of ['revealScreen', 'eliminatedScreen', 'captureScreen']) {
        await page.evaluate(id => {
          window.showScreen(id);
          const screen = document.getElementById(id);
          if (id === 'revealScreen') document.querySelector('#revealStage').innerHTML = '<div class="reveal-name display">A very long secret name</div>';
          screen.querySelectorAll('.eliminated-who').forEach(el => el.textContent = 'Alexandra '.repeat(10));
          screen.querySelectorAll('.eliminated-label').forEach(el => el.textContent = 'was captured by');
          screen.querySelectorAll('.reveal-name').forEach(el => el.textContent = 'A very long secret name');
          screen.querySelectorAll('.capture-count').forEach(el => el.textContent = '30');
          window.fitRevealText(screen);
        }, id);
        await contains('#' + id + ' > div:first-child', id + ' content');
        await noPageScroll();
      }
      await page.evaluate(() => {
        window.showScreen('revealScreen');
        document.querySelector('#revealStage').innerHTML = '<div class="count"><span class="count-num display">3</span></div>';
      });
      await contains('.count', 'countdown');
      await page.evaluate(() => window.showScreen('homeScreen'));
      const dialogs = await page.locator('dialog').evaluateAll(els => els.map(el => el.id));
      for (const id of dialogs) {
        await page.locator('#' + id).evaluate(el => el.showModal());
        await contains('#' + id, id + ' border');
        await noPageScroll();
        await page.locator('#' + id).evaluate(el => el.close());
      }
    });
  }
});
