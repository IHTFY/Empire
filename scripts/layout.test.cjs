/* global document, window, requestAnimationFrame, innerWidth, innerHeight, scrollX, scrollY, getComputedStyle */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
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
  if (process.env.LAYOUT_SCREENSHOTS) await mkdir(process.env.LAYOUT_SCREENSHOTS, { recursive: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const { createLobby } = await import('/lobby/render.js');
    const { fitRevealText } = await import('/reveal.js');
    const { crestSvg, parseCrest } = await import('/crest.js');
    document.querySelector('#crestPreview').innerHTML = crestSvg(parseCrest('heater.azure.plain.dragon.gold.riveted'));
    const { initializeFullscreen } = await import('/fullscreen.js');
    window.initializeFullscreen = initializeFullscreen;
    window.messages = [];
    initializeFullscreen({ toast: message => window.messages.push(message) });
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
    const target = typeof selector === 'string' ? page.locator(selector) : selector;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await target.evaluate(async el => {
      await Promise.all(el.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    });
    const bounds = await target.evaluate(el => {
      const r = el.getBoundingClientRect();
      const panel = el.closest('form, dialog');
      const p = panel && panel !== el ? panel.getBoundingClientRect() : null;
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight, panel: p && { x: p.x, y: p.y, right: p.right, bottom: p.bottom } };
    });
    assert(bounds.x >= -1 && bounds.y >= -1 && bounds.right <= bounds.vw + 1 && bounds.bottom <= bounds.vh + 1 && bounds.width > 0 && bounds.height > 0, `${label}: ${JSON.stringify(bounds)}`);
    if (bounds.panel) assert(bounds.y >= bounds.panel.y - 1 && bounds.bottom <= bounds.panel.bottom + 1 && bounds.x >= bounds.panel.x - 1 && bounds.right <= bounds.panel.right + 1, `${label} must remain inside its panel: ${JSON.stringify(bounds)}`);
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
        await page.evaluate(() => document.querySelectorAll('.field-error').forEach(el => el.textContent = ''));
        const panel = id === 'homeScreen' ? '#roomForm' : '#namesForm';
        await contains(panel, id + ' form');
        const scroll = await page.locator(panel).evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
        assert(scroll.scroll <= scroll.height + 1, `${width}x${height} ${id} should fit without scrolling: ${JSON.stringify(scroll)}`);
        if (id === 'homeScreen') {
          await page.evaluate(() => { document.querySelector('#passField').inert = false; document.querySelector('#createHint').inert = true; document.querySelector('#roomForm').dataset.mode = 'join'; });
          const join = await page.locator(panel).evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
          assert(join.scroll <= join.height + 1, `${width}x${height} join form should fit without scrolling: ${JSON.stringify(join)}`);
          await page.evaluate(() => { document.querySelector('#passField').inert = true; document.querySelector('#createHint').inert = false; document.querySelector('#roomForm').dataset.mode = 'create'; });
        }
        if (process.env.LAYOUT_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.LAYOUT_SCREENSHOTS, `${id}-${width}x${height}.png`) });
        // Validation messages must remain reachable without growing the screen.
        await page.evaluate(() => document.querySelectorAll('.field-error').forEach(el => el.textContent = 'Please enter a valid name before continuing.'));
        await contains('#' + id, id);
        await contains('#' + id + ' > .bar', id + ' toolbar');
        if (id === 'setupScreen') {
          await contains('.setup-title', 'setup heading');
          await contains('#crestButton', 'crest editor');
          const crest = await page.locator('#crestButton').evaluate(el => el.getBoundingClientRect().width);
          if (width >= 480 && width / height >= 1.25) assert(crest >= Math.min(height - 100, width / 2 - 60, 360), `Landscape crest should fill the right column: ${crest}`);
        }
        if (id === 'homeScreen') {
          for (const selector of ['.hero-logo', '.hero-title', '.hero-tagline']) {
            if (await page.locator(selector).isVisible()) await contains(selector, selector);
          }
          if (width === 390 && height === 844) {
            const logo = await page.locator('.hero-logo').boundingBox();
            assert(logo.width >= 160, `Portrait should retain the large logo: ${logo.width}`);
            const card = await page.locator('#roomForm').boundingBox();
            assert(card.y + card.height >= height - 32, 'Portrait room form should sit at the bottom');
          }
        }
        await contains(panel, id + ' form');
        await contains(id === 'homeScreen' ? '#roomSubmit' : '#submitNames', id + ' submit before any scrolling');
        await noPageScroll();
      }
      await page.evaluate(() => window.showScreen('lobbyScreen'));
      for (const [players, watchers] of [[2,0], [11,3], [30,15]]) {
        await page.evaluate(([n,w]) => window.populate(n,w), [players, watchers]);
        await contains('#tableView', 'table');
        await contains('#revealSecrets', 'reveal button');
        await contains('#lobbyScreen > .bar', 'lobby toolbar');
        if (watchers) await contains('#watching', 'watchers');
        const head = await page.locator('.list-head').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
        assert(head.scroll <= head.height + 1, `Room details should not scroll: ${JSON.stringify(head)}`);
        if (players === 11 && process.env.LAYOUT_SCREENSHOTS) {
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(process.env.LAYOUT_SCREENSHOTS, `lobby-${width}x${height}.png`) });
        }
        const table = await page.evaluate(() => {
          const stage = document.querySelector('.lobby-body').getBoundingClientRect();
          const r = document.querySelector('#tableView').getBoundingClientRect();
          return { size: r.width, expected: Math.min(stage.width,stage.height,1100), y: r.y, bottom: r.bottom, top: stage.y, limit: stage.bottom };
        });
        assert(Math.abs(table.size-table.expected) < 2 && table.y >= table.top-1 && table.bottom <= table.limit+1, JSON.stringify(table));
        if (width >= 480 && width / height >= 1.25) {
          const stage = await page.locator('.lobby-body').evaluate(el => ({ height: el.clientHeight, top: el.getBoundingClientRect().y, screen: el.closest('.screen').getBoundingClientRect().y, padding: parseFloat(getComputedStyle(el.closest('.screen')).paddingTop) }));
          assert(Math.abs(stage.top - stage.screen - stage.padding) < 1 && stage.height >= height - 56, `Landscape table must use the full screen height: ${JSON.stringify(stage)}`);
        }
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
        const actions = page.locator('#' + id + ' > button:not([hidden]), #' + id + ' > .row-2 > button:not([hidden]), #' + id + ' .switch');
        for (let i = 0; i < await actions.count(); i++) await contains(actions.nth(i), id + ' essential action');
        await noPageScroll();
        await page.locator('#' + id).evaluate(el => el.close());
      }
    });
  }
  await t.test('Rotation preserves toolbar anchors and reading order', async () => {
    for (const [width,height] of [[390,844], [844,390], [390,844]]) {
      await page.setViewportSize({ width,height });
      await page.evaluate(() => window.showScreen('lobbyScreen'));
      await contains('.bar-logo', 'Empire icon');
      const lobby = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        return { logo: rect('.bar-logo').x, room: rect('.list-room').x, roomY: rect('.list-room').y, toolbarBottom: rect('#lobbyScreen > .bar').bottom, toolbarX: rect('#lobbyScreen > .bar').x, toolbarWidth: rect('#lobbyScreen > .bar').width, toggleCenter: rect('#viewToggle').x + rect('#viewToggle').width / 2 };
      });
      assert(Math.abs(lobby.logo - lobby.room) < 1, JSON.stringify(lobby));
      assert(lobby.roomY >= lobby.toolbarBottom && lobby.roomY <= lobby.toolbarBottom + 16, JSON.stringify(lobby));
      assert(Math.abs(lobby.toggleCenter - lobby.toolbarX - lobby.toolbarWidth / 2) < 1, JSON.stringify(lobby));
      await page.evaluate(() => window.showScreen('setupScreen'));
      const setup = await page.evaluate(() => ({ title: document.querySelector('.setup-title').getBoundingClientRect().x, crest: document.querySelector('#crestButton').getBoundingClientRect().x, real: document.querySelector('#realName').getBoundingClientRect().x, secret: document.querySelector('#secretName').getBoundingClientRect().x }));
      assert(setup.title < setup.crest && setup.real <= setup.secret, JSON.stringify(setup));
    }
  });
  await t.test('Fullscreen enters from a click, exits, and handles rejection', async () => {
    await page.evaluate(() => {
      window.showScreen('homeScreen');
      const request = document.documentElement.requestFullscreen.bind(document.documentElement);
      document.documentElement.requestFullscreen = options => { window.fullscreenOptions = options; return request(options); };
    });
    await page.locator('#homeScreen [data-fullscreen]').click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    assert.equal(await page.evaluate(() => window.fullscreenOptions.navigationUI), 'hide');
    assert.equal(await page.locator('#homeScreen [data-fullscreen]').getAttribute('aria-label'), 'Exit fullscreen');
    await noPageScroll();
    await page.locator('#homeScreen [data-fullscreen]').click();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await page.locator('#homeScreen [data-fullscreen]').getAttribute('aria-label'), 'Enter fullscreen');
    await page.evaluate(() => {
      document.documentElement.requestFullscreen = async () => { throw new Error('Denied'); };
      document.querySelector('#optionsDialog').showModal();
    });
    await page.locator('#fullscreenButton').click();
    assert.equal(await page.locator('#fullscreenButton').isEnabled(), true);
    assert.equal(await page.evaluate(() => window.messages.at(-1)), 'Fullscreen is unavailable in this browser.');
    await page.evaluate(() => {
      document.querySelector('#optionsDialog').close();
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
      window.initializeFullscreen({ toast: () => {} });
    });
    assert.equal(await page.locator('[data-fullscreen]:not([hidden])').count(), 0);
  });
});
