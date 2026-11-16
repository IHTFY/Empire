const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const publicDir = join(__dirname, '../public');
const blocked = { getItem() { throw new DOMException('denied', 'SecurityError'); }, setItem() { throw new DOMException('denied', 'SecurityError'); }, removeItem() { throw new DOMException('denied', 'SecurityError'); } };
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, removeItem: key => { delete data[key]; }, data };
}
// Every element lookup returns one stand-in that accepts any property, call, or assignment.
function standIn() {
  const element = new Proxy(function () {}, { get: (_, key) => (key === 'style' ? { setProperty() {} } : element), apply: () => element, set: () => true });
  return element;
}
function setBrowser(storage) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  globalThis.document = { getElementById: standIn, addEventListener() {}, querySelectorAll: () => [] };
  globalThis.window = {};
}
const load = name => import(pathToFileURL(join(publicDir, name)).href);

test('storage helpers survive a browser that refuses site data', async () => {
  setBrowser(blocked);
  const { readStored, writeStored, removeStored } = await load('storage.js');
  assert.equal(readStored('realName'), null);
  assert.doesNotThrow(() => writeStored('realName', 'Ada'));
  assert.doesNotThrow(() => removeStored('realName'));
});

test('sound settings load with blocked storage and with garbage values', async () => {
  const { createAudio } = await load('audio.js');
  setBrowser(blocked);
  assert.doesNotThrow(() => createAudio({ db: {}, rollNumber() {} }));
  setBrowser(memoryStorage({ sfxVolume: 'loud', voiceVolume: '250', reverb: 'off' }));
  assert.doesNotThrow(() => createAudio({ db: {}, rollNumber() {} }));
});

test('saved values round-trip through the helpers', async () => {
  const storage = memoryStorage();
  setBrowser(storage);
  const { readStored, writeStored, removeStored } = await load('storage.js');
  writeStored('crest', 'a|b');
  assert.equal(readStored('crest'), 'a|b');
  removeStored('crest');
  assert.equal(readStored('crest'), null);
});

test('only the storage helper and the ad loader touch localStorage directly', () => {
  const files = readdirSync(publicDir, { recursive: true }).filter(name => name.endsWith('.js') && !name.startsWith('assets'));
  const direct = files.filter(name => /\blocalStorage\b/.test(readFileSync(join(publicDir, name), 'utf8')));
  assert.deepEqual(direct.sort(), ['ads.js', 'storage.js']);
});
