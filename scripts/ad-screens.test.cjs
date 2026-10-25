const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const publicFile = name => readFileSync(join(__dirname, '../public', name), 'utf8');

// ui.js decides which screens open the ad code; run it against stand-in elements.
async function createScreens() {
  const elements = { homeScreen: { hidden: true }, setupScreen: { hidden: true }, lobbyScreen: { hidden: true } };
  globalThis.document = { getElementById: id => elements[id], querySelectorAll: () => [], fonts: { ready: new Promise(() => {}) } };
  globalThis.window = { addEventListener() {}, scrollTo() {} };
  globalThis.requestAnimationFrame = () => {};
  const { createUI } = await import(pathToFileURL(join(__dirname, '../public/ui.js')).href);
  const calls = [];
  const ui = createUI({
    resetHomeForm() {}, fitTable() {}, refreshLobby() {},
    openHome: () => calls.push('open'),
    closeHome: () => calls.push('close')
  });
  return { ui, calls, elements };
}

test('only Home opens the ad; the room screens close it and never open it', async () => {
  const { ui, calls, elements } = await createScreens();
  ui.show('home');
  assert.deepEqual(calls.splice(0), ['open']);
  for (const name of ['setup', 'lobby']) {
    ui.show(name);
    assert.deepEqual(calls.splice(0), ['close'], `${name} screen`);
    assert.equal(elements.homeScreen.hidden, true);
  }
});

test('the page has one ad box, on Home, outside every dialog', () => {
  const html = publicFile('index.html');
  assert.equal(html.match(/data-ad-slot/g).length, 1);
  const aside = html.match(/<aside id="homeAd"[\s\S]*?<\/aside>/)[0];
  assert.match(aside, /data-ad-slot="6470163205"/);
  assert.match(aside, />Advertisements</);
  const home = html.match(/<div class="home-page">[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(home, /data-ad-slot/);
  for (const [dialog] of html.matchAll(/<dialog[\s\S]*?<\/dialog>/g)) assert.doesNotMatch(dialog, /data-ad-slot|homeAd/);
  const roomScreens = html.slice(html.indexOf('id="setupScreen"'));
  assert.doesNotMatch(roomScreens.replace(aside, ''), /data-ad-slot/);
});

test('the how-to page, which opens inside a dialog, has no ad', () => {
  const html = publicFile('how-to.html');
  assert.doesNotMatch(html, /data-ad-slot|ads\/v1\.js|adsbygoogle/);
});

test('no room script touches the ad code', () => {
  for (const name of ['rooms.js', 'reveal.js', 'room-presence.js', 'presence.js', 'captures.js', 'lobby/render.js', 'lobby/seating.js', 'lobby/transitions.js', 'bots.js']) {
    assert.doesNotMatch(publicFile(name), /ads\.js|ihtfyAds|homeAd/, name);
  }
});

test('the app takes the ad down when a dialog opens or the window no longer fits it', () => {
  const script = publicFile('script.js');
  assert.match(script, /addEventListener\('sheetopen', \(\) => retireHomeAd\(/);
  assert.match(script, /addEventListener\('resize', \(\) => refitHomeAd\(/);
  assert.match(publicFile('sheets.js'), /dispatchEvent\(new CustomEvent\('sheetopen'\)\);\s*dialog\.showModal\(\)/);
});
