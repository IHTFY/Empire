/* global document, getComputedStyle, MutationObserver */
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.join(__dirname, '../public');

// The tutorial iframe stays hidden while its sheet slides in and is revealed once it lands.
test('The tutorial is hidden during the sheet animation and revealed after it', async t => {
  const server = createServer(async (req, res) => {
    try {
      const name = new URL(req.url, 'http://x').pathname;
      let body = await readFile(path.join(root, name === '/' ? 'index.html' : name));
      if (name === '/') body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html';
      res.writeHead(200, { 'Content-Type': type }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch();
  t.after(() => browser.close());

  const states = [
    ['phone', { viewport: { width: 412, height: 915 }, hasTouch: true }],
    ['wide screen', { viewport: { width: 1440, height: 900 } }],
    ['reduced motion', { viewport: { width: 412, height: 915 }, hasTouch: true, reducedMotion: 'reduce' }]
  ];
  for (const [label, options] of states) {
    await t.test(label, async () => {
      const page = await browser.newPage(options);
      t.after(() => page.close());
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(async () => {
        const { initializeSheets } = await import('/sheets.js');
        initializeSheets();
      });
      const opener = page.locator('#homeScreen [data-open="rulesDialog"]');
      const focusOnTutorial = () => page.waitForFunction(() => document.activeElement.id === 'tutorialFrame', null, { timeout: 2000 });
      // Reduced motion gives every property a near-instant transition, so the style catches up a frame late.
      const revealed = async () => {
        await landed();
        await page.waitForFunction(() => getComputedStyle(document.getElementById('tutorialFrame')).visibility === 'visible');
      };
      // The close event, which clears the closing class, comes a moment after the dialog stops being open.
      const closed = () => page.waitForFunction(() => !document.getElementById('rulesDialog').open && !document.getElementById('rulesDialog').classList.contains('closing'));
      const landed = () => page.waitForFunction(() => !document.getElementById('rulesDialog').classList.contains('opening'));
      // Clicks and reads the state in one go: with reduced motion the reveal can follow within a frame.
      const openNow = () => page.evaluate(() => {
        document.querySelector('#homeScreen [data-open="rulesDialog"]').click();
        const dialog = document.getElementById('rulesDialog');
        const visibility = getComputedStyle(document.getElementById('tutorialFrame')).visibility;
        return { open: dialog.open, opening: dialog.classList.contains('opening'), visibility };
      });
      const hiddenAtOpen = { open: true, opening: true, visibility: 'hidden' };

      // A plain open: hidden at first, then revealed with focus on the frame, as before.
      assert.deepEqual(await openNow(), hiddenAtOpen, 'Opens in the hidden state');
      await revealed();
      await focusOnTutorial();
      await page.frameLocator('#tutorialFrame').locator('.seat').first().waitFor();

      // Closing in the middle of the slide, then opening again, starts hidden again.
      await page.keyboard.press('Escape');
      await closed();
      await opener.evaluate(el => el.click());
      await page.keyboard.press('Escape');
      await closed();
      assert.deepEqual(await openNow(), hiddenAtOpen, 'A reopen starts hidden');
      await revealed();
      await focusOnTutorial();

      // Opening twice in a row reveals once, with nothing left in the hidden state.
      await page.evaluate(() => {
        document.querySelector('#homeScreen [data-open="rulesDialog"]').click();
        document.querySelector('#homeScreen [data-open="rulesDialog"]').click();
      });
      await revealed();
      assert.equal(await page.evaluate(() => document.getElementById('rulesDialog').classList.contains('opening')), false);

      // A sheet whose animation never ends is revealed by the timer.
      await page.keyboard.press('Escape');
      await closed();
      const still = await page.addStyleTag({ content: 'dialog.sheet[open] { animation: none !important; }' });
      assert.deepEqual(await openNow(), hiddenAtOpen);
      await revealed();
      await focusOnTutorial();
      await page.keyboard.press('Escape');
      await closed();
      await still.evaluate(el => el.remove());

      // Dismissed before it lands, the tutorial stays hidden while the sheet slides away, even past
      // the reveal timer. The sheet's motion is slowed so it can't land first, and page timers
      // order the steps: the dismissal at 200 ms, the reveal timer at 450, the close timer at 600.
      const slow = await page.addStyleTag({ content: 'dialog.sheet[open] { animation-duration: 2s !important; }' });
      const early = await page.evaluate(async () => {
        const { closeSheet } = await import('/sheets.js');
        const dialog = document.getElementById('rulesDialog');
        let shownWhileClosing = false;
        new MutationObserver(() => {
          if (dialog.open && dialog.classList.contains('closing') && !dialog.classList.contains('opening')) shownWhileClosing = true;
        }).observe(dialog, { attributes: true, attributeFilter: ['class'] });
        document.querySelector('#homeScreen [data-open="rulesDialog"]').click();
        const openingAtDismissal = await new Promise(resolve => setTimeout(() => {
          resolve(dialog.classList.contains('opening'));
          closeSheet(dialog);
        }, 200));
        await new Promise((resolve, reject) => {
          dialog.addEventListener('close', resolve, { once: true });
          setTimeout(() => reject(new Error('The sheet never closed')), 3000);
        });
        return { openingAtDismissal, shownWhileClosing, openingAfterClose: dialog.classList.contains('opening') };
      });
      assert.deepEqual(early, { openingAtDismissal: true, shownWhileClosing: false, openingAfterClose: false }, 'Stays hidden while sliding away');
      await slow.evaluate(el => el.remove());
      assert.deepEqual(errors, []);
    });
  }
});
