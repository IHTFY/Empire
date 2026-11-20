/* global document, window */
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.join(__dirname, '../public');

test('A player who leaves the table and comes straight back keeps one seat', async t => {
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
  await page.evaluate(async () => {
    const { createLobby } = await import('/lobby/render.js');
    document.querySelectorAll('.screen').forEach(el => el.hidden = el.id !== 'lobbyScreen');
    window.room = { id: 'table', state: 'waiting', users: {}, presence: {} };
    window.lobby = createLobby({ getRoom: () => window.room, getUid: () => 'sage', ui: { rollNumber: (el, n) => el.textContent = n, toast: () => {} }, isRevealing: () => false });
    window.seat = keys => {
      const names = { sage: 'Sage', quinn: 'Quinn' };
      window.room.users = Object.fromEntries(keys.map(key => [key, { real: names[key], clan: names[key] }]));
      window.room.presence = Object.fromEntries(keys.map(key => [key, { online: true }]));
      window.lobby.render();
    };
  });
  const labels = () => page.locator('#seats .seat-label').evaluateAll(els => els.map(el => el.textContent).sort());

  await page.evaluate(() => window.seat(['sage', 'quinn']));
  // A new round clears the roster, then both players sit back down before Quinn's seat
  // finishes fading out.
  await page.evaluate(() => { window.seat(['sage']); window.seat(['sage', 'quinn']); });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.lobby.render());
  assert.deepEqual(await labels(), ['Quinn', 'Sage']);
  assert.equal(await page.evaluate(() => window.lobby.getSeats().size), 2);
  assert.deepEqual(errors, []);
});
