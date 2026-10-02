const assert = require('node:assert/strict');
const { test } = require('node:test');

// Mounts the real controller against a fake button, room, fetch and database.
async function mount({ room, lists = () => Promise.resolve({ ok: true, text: async () => 'one\ntwo\n' }) }) {
  let click;
  global.document = { getElementById: () => ({ addEventListener: (type, handler) => { click = handler; } }) };
  const fetches = [];
  global.fetch = url => { fetches.push(url); return lists(url); };
  const writes = [];
  const toasts = [];
  const db = { ref: path => ({ push: () => ({ key: 'bot1' }), update: async value => { writes.push([path, value]); } }) };
  const { createBots } = await import('../public/bots.js?' + Math.random());
  createBots({ db, getRoom: () => room, getUid: () => 'me', toast: message => toasts.push(message) });
  return { click: () => click(), writes, toasts, fetches };
}
const open = () => ({ id: 'A', state: 'waiting', locked: false, users: { me: {} } });

test('a normal click adds the bot and its secret together', async () => {
  const t = await mount({ room: open() });
  await t.click();
  assert.equal(t.writes.length, 1);
  assert.equal(t.writes[0][0], 'games/A');
  assert.deepEqual(Object.keys(t.writes[0][1]), ['users/bot1', 'secrets/bot1']);
});

test('switching rooms while lists load writes to neither room', async () => {
  const room = open();
  const gate = Promise.withResolvers();
  const t = await mount({ room, lists: () => gate.promise.then(() => ({ ok: true, text: async () => 'x' })) });
  const pending = t.click();
  Object.assign(room, { id: 'B' });
  gate.resolve();
  await pending;
  assert.deepEqual(t.writes, []);
});

test('a room that locks while loading gets no bot', async () => {
  const room = open();
  const t = await mount({ room, lists: async () => { room.locked = true; return { ok: true, text: async () => 'x' }; } });
  await t.click();
  assert.deepEqual(t.writes, []);
});

test('repeated clicks while pending add one bot', async () => {
  const room = open();
  const gate = Promise.withResolvers();
  const t = await mount({ room, lists: () => gate.promise.then(() => ({ ok: true, text: async () => 'x' })) });
  const first = t.click();
  const second = t.click();
  await second;
  gate.resolve();
  await first;
  assert.equal(t.writes.length, 1);
});

test('a failed list load shows feedback and can be retried', async () => {
  let ok = false;
  const t = await mount({ room: open(), lists: async () => ({ ok, text: async () => 'x' }) });
  await t.click();
  assert.deepEqual(t.writes, []);
  assert.equal(t.toasts.length, 1);
  ok = true;
  await t.click();
  assert.equal(t.writes.length, 1);
});
