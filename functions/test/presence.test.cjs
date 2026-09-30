const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { harness } = require('./support/functions.cjs');

test('presence stays online and active if any connection remains active', async () => {
  const { summarizePresence } = await import(pathToFileURL(path.join(__dirname, '../../public/presence.js')).href);
  const entry = { version: 2, online: false, lastSeen: 123, connections: { a: { away: true, name: 'Alice' }, b: { away: false, name: 'Alice' } } };
  assert.equal(summarizePresence(entry).online, true);
  assert.equal(summarizePresence(entry).away, false);
  delete entry.connections.b;
  assert.equal(summarizePresence(entry).online, true);
  assert.equal(summarizePresence(entry).away, true);
  delete entry.connections.a;
  entry.online = true;
  assert.equal(summarizePresence(entry).online, false);
  assert.equal(summarizePresence(entry).away, false);
  assert.equal(summarizePresence(entry).lastSeen, 123);
  const legacy = { online: true, away: false, lastSeen: 456 };
  assert.deepEqual(summarizePresence(legacy), legacy);
});

test('room cleanup respects active connections and ignores stale legacy online flags on v2 entries', async () => {
  const old = Date.now() - 13 * 60 * 60 * 1000;
  const h = harness({ games: {
    live: { state: 'waiting', createdAt: old, presence: { alice: { version: 2, online: false, lastSeen: old, connections: { a: { away: true, name: 'Alice' } } } } },
    gone: { state: 'waiting', createdAt: old, presence: { alice: { version: 2, online: true, lastSeen: old } } },
    legacy: { state: 'waiting', createdAt: old, presence: { alice: { online: true, lastSeen: old } } }
  } });
  await h.exports.dailySweep();
  assert.equal(h.data.games.live.state, 'waiting');
  assert.equal(h.data.games.gone, undefined);
  assert.equal(h.data.games.legacy.state, 'waiting');
});
