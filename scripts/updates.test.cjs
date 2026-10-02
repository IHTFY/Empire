const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const current = 'a'.repeat(64);
const next = 'b'.repeat(64);
function harness() {
  const events = {};
  const elements = { updateToast: { hidden: true }, updateApp: {}, updateMessage: {}, dismissUpdate: {} };
  const calls = [];
  let response = { ok: true, json: async () => ({ version: current }) };
  let reloads = 0;
  const listen = (name, callback) => { events[name] = callback; };
  elements.updateApp.addEventListener = listen;
  elements.dismissUpdate.addEventListener = (name, callback) => { events.dismiss = callback; };
  const context = vm.createContext({
    AbortSignal,
    document: { hidden: false, getElementById: id => elements[id], addEventListener: listen },
    navigator: { onLine: true }, window: { addEventListener: listen },
    location: { reload: () => { reloads++; } },
    setInterval: callback => { events.poll = callback; },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (response instanceof Error) throw response;
      return response;
    }
  });
  const source = readFileSync(join(__dirname, '../public/updates.js'), 'utf8').replace('export function', 'function');
  vm.runInContext(source, context);
  context.initializeUpdates(current);
  return { context, elements, events, calls, setResponse: value => { response = value; }, reloads: () => reloads };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('matching versions and malformed manifests do not prompt; newer versions persist without reloading', async () => {
  const h = harness();
  await settle();
  assert.equal(h.elements.updateToast.hidden, true);
  h.setResponse({ ok: true, json: async () => ({ version: next }) });
  await h.events.poll();
  assert.equal(h.elements.updateToast.hidden, false);
  h.setResponse(new Error('offline'));
  await h.events.focus();
  assert.equal(h.elements.updateToast.hidden, false);
  h.setResponse({ ok: true, json: async () => ({ version: 'invalid' }) });
  await h.events.online();
  assert.equal(h.elements.updateToast.hidden, false);
  assert.equal(h.reloads(), 0);
  assert(h.calls.every(call => call.url === '/version.json' && call.options.cache === 'no-store'));
});

test('returning to the foreground checks again; background and offline polling skip requests', async () => {
  const h = harness();
  await settle();
  h.context.document.hidden = true;
  await h.events.poll();
  h.context.document.hidden = false;
  h.context.navigator.onLine = false;
  await h.events.poll();
  assert.equal(h.calls.length, 1);
  h.context.navigator.onLine = true;
  h.setResponse({ ok: true, json: async () => ({ version: next }) });
  await h.events.visibilitychange();
  assert.equal(h.elements.updateToast.hidden, false);
});

test('Update retries a failed download and reloads only after a valid response', async () => {
  const h = harness();
  await settle();
  h.setResponse(new Error('offline'));
  await h.events.click();
  assert.equal(h.reloads(), 0);
  assert.equal(h.elements.updateApp.disabled, false);
  assert.match(h.elements.updateMessage.textContent, /connection/);
  h.setResponse({ ok: true, json: async () => ({ version: next }) });
  await h.events.click();
  await h.events.click();
  assert.equal(h.reloads(), 1);
});

test('dismissal lasts for this version in the open tab; another deployment prompts again', async () => {
  const h = harness();
  await settle();
  h.setResponse({ ok: true, json: async () => ({ version: next }) });
  await h.events.focus();
  h.events.dismiss();
  await h.events.poll();
  assert.equal(h.elements.updateToast.hidden, true);
  h.setResponse({ ok: true, json: async () => ({ version: 'c'.repeat(64) }) });
  await h.events.poll();
  assert.equal(h.elements.updateToast.hidden, false);
});
