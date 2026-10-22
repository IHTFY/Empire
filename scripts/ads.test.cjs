const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

class FakeScript {
  constructor() { this.listeners = {}; this.removed = false; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  remove() { this.removed = true; }
}

function harness({ onLine = true } = {}) {
  const added = [];
  const shown = [];
  const storage = new Map();
  const context = vm.createContext({
    navigator: { onLine },
    document: {
      createElement: () => new FakeScript(),
      head: { appendChild: el => { added.push(el); } }
    },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    window: { ihtfyAds: { show: (box, key) => shown.push([box, key]) } }
  });
  const source = readFileSync(join(__dirname, '../public/ads.js'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { context, added, shown };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('Home shows nothing and loads nothing before a finished round', () => {
  const h = harness();
  const aside = { hidden: true };
  h.context.showHomeAd(aside, { isConnected: true });
  assert.equal(aside.hidden, true);
  assert.equal(h.added.length, 0);
});

test('after a finished round, Home loads the shared loader once and names the round', async () => {
  const h = harness();
  const aside = { hidden: true };
  const box = { isConnected: true };
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(aside, box);
  h.context.showHomeAd(aside, box);
  assert.equal(aside.hidden, false);
  assert.equal(h.added.length, 1);
  assert.equal(h.added[0].src, 'https://ihtfy.com/ads/v1.js');
  h.added[0].listeners.load();
  await settle();
  assert.deepEqual(h.shown, [[box, 'room/round-1'], [box, 'room/round-1']]);
});

test('offline, Home keeps the box empty and requests no loader', () => {
  const h = harness({ onLine: false });
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd({ hidden: true }, { isConnected: true });
  assert.equal(h.added.length, 0);
});

test('a failed loader stays quiet and is tried again on the next visit to Home', async () => {
  const h = harness();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd({ hidden: true }, { isConnected: true });
  h.added[0].listeners.error();
  await settle();
  assert.equal(h.added[0].removed, true);
  assert.equal(h.shown.length, 0);
  h.context.showHomeAd({ hidden: true }, { isConnected: true });
  assert.equal(h.added.length, 2);
});

test('a box removed before the loader arrives gets no ad, so its replacement can have the round', async () => {
  const h = harness();
  h.context.rememberFinishedRound('room/round-1');
  const old = { isConnected: true };
  const replacement = { isConnected: true };
  h.context.showHomeAd({ hidden: true }, old);
  old.isConnected = false;
  h.context.showHomeAd({ hidden: true }, replacement);
  h.added[0].listeners.load();
  await settle();
  assert.deepEqual(h.shown, [[replacement, 'room/round-1']]);
});

// A box in a fake page: replaceWith disconnects it, cloneNode gives an empty connected copy.
function fakeBox({ filled = false } = {}) {
  const box = {
    isConnected: true,
    querySelector: () => filled ? {} : null,
    cloneNode: () => { box.copy = fakeBox(); return box.copy; },
    replaceWith: copy => { box.isConnected = false; box.replacedBy = copy; }
  };
  return box;
}

test('a new round gets a fresh box, because the loader refuses a box that holds an ad', async () => {
  const h = harness();
  const aside = { hidden: true };
  const first = fakeBox({ filled: true });
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(aside, first);
  h.context.rememberFinishedRound('room/round-2');
  h.context.showHomeAd(aside, first);
  h.added[0].listeners.load();
  await settle();
  assert.equal(first.isConnected, false);
  assert.deepEqual(h.shown, [[first.copy, 'room/round-2']]);
});

test('closing Home replaces a box still waiting for its ad, so nothing is requested in the hidden screen', async () => {
  const h = harness();
  const box = fakeBox();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd({ hidden: true }, box);
  h.context.closeHomeAd(box);
  h.added[0].listeners.load();
  await settle();
  assert.equal(box.isConnected, false);
  assert.equal(h.shown.length, 0);
  h.context.showHomeAd({ hidden: true }, box.copy);
  await settle();
  assert.deepEqual(h.shown, [[box.copy, 'room/round-1']]);
});

test('closing Home keeps a box that already holds its ad', () => {
  const h = harness();
  const box = fakeBox({ filled: true });
  h.context.closeHomeAd(box);
  assert.equal(box.isConnected, true);
});
