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

function harness({ onLine = true, key = null, cookie = '', adFree = false } = {}) {
  const listeners = {};
  const document = {
    cookie,
    activeElement: null,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    createElement: () => new FakeScript(),
    head: { appendChild: el => { added.push(el); } }
  };
  const added = [];
  const shown = [];
  const storage = new Map();
  const context = vm.createContext({
    navigator: { onLine },
    document,
    localStorage: { getItem: name => (name === 'ihtfy-ad-free' ? key : null) },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    ResizeObserver: class { observe() {} },
    clearTimeout() {},
    setTimeout() {},
    window: { addEventListener: (name, callback) => { listeners[name] = callback; }, ihtfyAds: { show: (box, key) => shown.push([box, key]), adFree: async () => adFree } }
  });
  const source = readFileSync(join(__dirname, '../public/ads.js'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { context, added, shown, document, listeners };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

// A box and the page around it, as far as the ad code looks: the box's size attribute, and
// whether Home still fits with the box at that size. `filled` boxes hold an ad already;
// replaceWith disconnects a box and cloneNode gives an empty, connected copy.
const SIZES = ['300x250', '320x100', '320x50'];
function fakeHome({ fitting = SIZES, filled = false } = {}) {
  const home = { box: null, fitting };
  const overflow = () => (home.fitting.includes(home.box.dataset.adSize) ? 0 : 1);
  const form = { scrollHeight: 300, clientHeight: 300 };
  const hero = { clientHeight: 80 };
  const page = {
    get scrollHeight() { return 640 + overflow(); },
    clientHeight: 640,
    scrollWidth: 360,
    clientWidth: 360,
    classList: { add() {}, remove() {} },
    querySelector: selector => (selector === '#roomForm' ? form : hero)
  };
  home.aside = { hidden: true, parentElement: page };
  home.newBox = (isFilled, dataset = {}) => {
    const box = {
      isConnected: true,
      dataset: { ...dataset },
      querySelector: () => (isFilled ? {} : null),
      cloneNode: () => { box.copy = home.newBox(false, box.dataset); return box.copy; },
      replaceWith: copy => { box.isConnected = false; box.replacedBy = copy; }
    };
    home.box = box;
    return box;
  };
  home.newBox(filled);
  return home;
}
const sizeAttribute = home => home.box.dataset.adSize;

test('Home shows nothing and loads nothing before a finished round', () => {
  const h = harness();
  const home = fakeHome();
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, true);
  assert.equal(h.added.length, 0);
});

test('after a finished round, Home loads the shared loader once and names the round', async () => {
  const h = harness();
  const home = fakeHome();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, false);
  assert.equal(h.added.length, 1);
  assert.equal(h.added[0].src, 'https://ihtfy.com/ads/v1.js');
  h.added[0].listeners.load();
  await settle();
  assert.deepEqual(h.shown, [[home.box, 'room/round-1'], [home.box, 'room/round-1']]);
});

test('the box takes the largest size that fits Home', () => {
  for (const [fitting, expected] of [[SIZES, '300x250'], [SIZES.slice(1), '320x100'], [SIZES.slice(2), '320x50']]) {
    const h = harness();
    const home = fakeHome({ fitting });
    h.context.rememberFinishedRound('room/round-1');
    h.context.showHomeAd(home.aside, home.box);
    assert.equal(sizeAttribute(home), expected);
    assert.equal(home.aside.hidden, false);
  }
});

test('a window too short for the smallest box gets no ad and loads nothing', () => {
  const h = harness();
  const home = fakeHome({ fitting: [] });
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, true);
  assert.equal(sizeAttribute(home), undefined);
  assert.equal(h.added.length, 0);
});

test('Home keeps its hero: a size that squeezes it below 40px is skipped', () => {
  const h = harness();
  const home = fakeHome();
  const hero = home.aside.parentElement.querySelector('.hero');
  Object.defineProperty(hero, 'clientHeight', { get: () => (home.box.dataset.adSize === '320x50' ? 60 : 20) });
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(sizeAttribute(home), '320x50');
});

test('a form that would scroll rules a size out', () => {
  const h = harness();
  const home = fakeHome();
  const form = home.aside.parentElement.querySelector('#roomForm');
  Object.defineProperty(form, 'scrollHeight', { get: () => (home.box.dataset.adSize === '320x50' ? 300 : 340) });
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(sizeAttribute(home), '320x50');
});

test('offline, Home shows no box and requests no loader', () => {
  const h = harness({ onLine: false });
  const home = fakeHome();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, true);
  assert.equal(h.added.length, 0);
});

test('a failed loader stays quiet and is tried again on the next visit to Home', async () => {
  const h = harness();
  h.context.rememberFinishedRound('room/round-1');
  const first = fakeHome();
  h.context.showHomeAd(first.aside, first.box);
  h.added[0].listeners.error();
  await settle();
  assert.equal(h.added[0].removed, true);
  assert.equal(h.shown.length, 0);
  h.context.showHomeAd(first.aside, first.box);
  assert.equal(h.added.length, 2);
});

test('a box removed before the loader arrives gets no ad, so its replacement can have the round', async () => {
  const h = harness();
  h.context.rememberFinishedRound('room/round-1');
  const home = fakeHome();
  const old = home.box;
  h.context.showHomeAd(home.aside, old);
  old.isConnected = false;
  const replacement = home.newBox(false);
  h.context.showHomeAd(home.aside, replacement);
  h.added[0].listeners.load();
  await settle();
  assert.deepEqual(h.shown, [[replacement, 'room/round-1']]);
});

test('a new round gets a fresh box, because the loader refuses a box that holds an ad', async () => {
  const h = harness();
  const home = fakeHome({ filled: true });
  const first = home.box;
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, first);
  h.context.rememberFinishedRound('room/round-2');
  h.context.showHomeAd(home.aside, first);
  h.added[0].listeners.load();
  await settle();
  assert.equal(first.isConnected, false);
  assert.deepEqual(h.shown, [[first.copy, 'room/round-2']]);
});

test('closing Home replaces a box still waiting for its ad, so nothing is requested in the hidden screen', async () => {
  const h = harness();
  const home = fakeHome();
  const box = home.box;
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, box);
  h.context.closeHomeAd(box);
  h.added[0].listeners.load();
  await settle();
  assert.equal(box.isConnected, false);
  assert.equal(h.shown.length, 0);
  h.context.showHomeAd(home.aside, box.copy);
  await settle();
  assert.deepEqual(h.shown, [[box.copy, 'room/round-1#1']]);
});

test('a canceled request still holding its round key does not block the replacement', async () => {
  const h = harness();
  const pendingKeys = new Set();
  h.context.window.ihtfyAds.show = (box, key) => {
    if (pendingKeys.has(key)) return;
    pendingKeys.add(key);
    h.shown.push([box, key]);
  };
  h.context.rememberFinishedRound('room/round-1');
  const home = fakeHome();
  const box = home.box;
  h.context.showHomeAd(home.aside, box);
  h.added[0].listeners.load();
  await settle();
  h.context.closeHomeAd(box);
  h.context.showHomeAd(home.aside, box.copy);
  await settle();
  assert.equal(h.shown.length, 2);
  assert.notEqual(h.shown[0][1], h.shown[1][1]);
  assert.equal(h.shown[1][0], box.copy);
});

test('closing Home keeps a box that already holds its ad', () => {
  const h = harness();
  const home = fakeHome({ filled: true });
  h.context.closeHomeAd(home.box);
  assert.equal(home.box.isConnected, true);
});

test('a dialog opening over Home takes the ad down, and that round gets no other', async () => {
  const h = harness();
  const home = fakeHome({ filled: true });
  const box = home.box;
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, box);
  h.context.retireHomeAd(home.aside, box);
  assert.equal(box.isConnected, false);
  assert.equal(home.aside.hidden, true);
  h.context.closeHomeAd(box.copy);
  h.context.showHomeAd(home.aside, box.copy);
  assert.equal(home.aside.hidden, true);
  h.added[0]?.listeners.load();
  await settle();
  assert.equal(h.shown.length, 0);
  h.context.rememberFinishedRound('room/round-2');
  h.context.showHomeAd(home.aside, box.copy);
  assert.equal(home.aside.hidden, false);
});

test('a dialog opening while the ad-free check is pending stops the box from appearing', async () => {
  const h = harness({ key: 'x.y.z' });
  const home = fakeHome();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  h.context.retireHomeAd(home.aside, home.box);
  h.added[0].listeners.load();
  await settle();
  assert.equal(home.aside.hidden, true);
  assert.equal(h.shown.length, 0);
});

test('a dialog opened outside Home leaves the next Home visit alone', () => {
  const h = harness();
  const home = fakeHome();
  h.context.rememberFinishedRound('room/round-1');
  h.context.retireHomeAd(home.aside, home.box);
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, false);
});

test('a buyer gets no box and no request while the loader checks the stored key', async () => {
  const h = harness({ key: 'x.y.z', adFree: true });
  const home = fakeHome();
  h.context.loadForBuyer();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, true);
  h.added[0].listeners.load();
  await settle();
  assert.equal(home.aside.hidden, true);
  assert.equal(sizeAttribute(home), undefined);
  assert.equal(h.shown.length, 0);
});

test('a stored key that proves invalid gets its box once the check is done', async () => {
  const h = harness({ key: 'x.y.z', adFree: false });
  const home = fakeHome();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, true);
  h.added[0].listeners.load();
  await settle();
  assert.equal(home.aside.hidden, false);
  assert.equal(sizeAttribute(home), '300x250');
  assert.deepEqual(h.shown, [[home.box, 'room/round-1']]);
});

test('a buyer who left Home before the check ended gets nothing in the hidden screen', async () => {
  const h = harness({ key: 'x.y.z', adFree: false });
  const home = fakeHome();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  h.context.closeHomeAd(home.box);
  h.added[0].listeners.load();
  await settle();
  assert.equal(home.aside.hidden, true);
  assert.equal(h.shown.length, 0);
});

test('a failed loader leaves a possible buyer without a box', async () => {
  const h = harness({ cookie: 'ihtfy-ad-free=x.y.z' });
  const home = fakeHome();
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  h.added[0].listeners.error();
  await settle();
  assert.equal(home.aside.hidden, true);
});

test('without an ad-free key, startup loads nothing', () => {
  const h = harness({ cookie: 'other=1' });
  h.context.loadForBuyer();
  assert.equal(h.added.length, 0);
});

test('with an ad-free key in storage, startup loads the loader once and a later ad reuses it', async () => {
  const h = harness({ key: 'x.y.z' });
  h.context.loadForBuyer();
  assert.equal(h.added.length, 1);
  assert.equal(h.added[0].src, 'https://ihtfy.com/ads/v1.js');
  h.context.rememberFinishedRound('room/round-1');
  const home = fakeHome();
  h.context.showHomeAd(home.aside, home.box);
  assert.equal(h.added.length, 1);
});

test('with only the ad-free cookie, startup loads the loader', () => {
  const h = harness({ cookie: 'a=1; ihtfy-ad-free=x.y.z' });
  h.context.loadForBuyer();
  assert.equal(h.added.length, 1);
});

test('a failed startup load stays quiet', async () => {
  const h = harness({ key: 'x.y.z' });
  h.context.loadForBuyer();
  h.added[0].listeners.error();
  await settle();
  assert.equal(h.added[0].removed, true);
});

test('startup goes on when storage and cookies both throw', () => {
  const h = harness();
  h.context.localStorage.getItem = () => { throw new Error('denied'); };
  Object.defineProperty(h.context.document, 'cookie', { get() { throw new Error('denied'); } });
  assert.doesNotThrow(() => h.context.loadForBuyer());
  assert.equal(h.added.length, 0);
});

test('turning the phone to a window the box no longer fits takes the ad down for good', () => {
  const h = harness();
  const home = fakeHome({ filled: true, fitting: SIZES });
  home.box.dataset.adSize = '300x250';
  const box = home.box;
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, box);
  h.context.refitHomeAd(home.aside, box);
  assert.equal(home.aside.hidden, false, 'a box that still fits stays');
  home.fitting = [];
  h.context.refitHomeAd(home.aside, box);
  assert.equal(box.isConnected, false);
  assert.equal(home.aside.hidden, true);
  home.fitting = SIZES;
  h.context.showHomeAd(home.aside, box.copy);
  assert.equal(home.aside.hidden, true, 'the round gets no second box');
});

test('a resize while a field has focus (the keyboard) leaves the ad alone', () => {
  const h = harness();
  const home = fakeHome({ filled: true, fitting: SIZES });
  home.box.dataset.adSize = '300x250';
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, home.box);
  home.fitting = [];
  h.document.activeElement = { matches: selector => selector.includes('input') };
  h.context.refitHomeAd(home.aside, home.box, true);
  assert.equal(home.aside.hidden, false);
  h.context.refitHomeAd(home.aside, home.box);
  assert.equal(home.aside.hidden, true, 'a change to the form is not the keyboard');
});

test('coming back to Home in a window that no longer fits the filled box takes it down', () => {
  const h = harness();
  const home = fakeHome({ filled: true, fitting: SIZES });
  home.box.dataset.adSize = '300x250';
  const box = home.box;
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, box);
  h.context.closeHomeAd(box);
  home.fitting = [];
  h.context.showHomeAd(home.aside, box);
  assert.equal(home.aside.hidden, true);
  assert.equal(box.isConnected, false);
});

test('the dialog and resize handlers act on the box Home has now, not the one it started with', () => {
  const h = harness();
  const home = fakeHome({ fitting: SIZES });
  home.aside.querySelector = () => home.box;
  const first = home.box;
  h.context.rememberFinishedRound('room/round-1');
  h.context.showHomeAd(home.aside, first);
  h.context.closeHomeAd(first);
  const second = first.copy;
  assert.notEqual(second, first);
  home.box = second;
  h.context.showHomeAd(home.aside, second);
  h.context.watchHomeAd(home.aside, { children: [] });
  h.listeners.sheetopen();
  assert.equal(second.isConnected, false, 'the live box came down');
  assert.equal(home.aside.hidden, true);
});
