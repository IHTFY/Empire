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

test('room cleanup keeps a room that reconnects after the sweep read its snapshot', async () => {
  const old = Date.now() - 13 * 60 * 60 * 1000;
  const room = name => ({ state: 'waiting', name, pass: 'x', createdAt: old, presence: { alice: { version: 2, online: false, lastSeen: old } } });
  let ref;
  const database = { ref: target => ref(target) };
  const h = harness({
    games: { back: room('Den'), idle: room('Old') },
    roomNames: { Den: { x: 'back' }, Old: { x: 'idle' } }
  }, {}, { database });
  let reads = 0;
  ref = (target = '') => {
    const base = h.ref(target);
    if (target !== 'games') return base;
    // Alice reconnects right after the sweep captures its snapshot.
    return { ...base, once: async () => {
      const snap = await base.once();
      if (++reads === 1) h.data.games.back.presence.alice = { version: 2, online: true, lastSeen: Date.now(), connections: { a: { name: 'Alice' } } };
      return snap;
    } };
  };
  await h.exports.dailySweep();
  assert.ok(h.data.games.back);
  assert.equal(h.data.roomNames.Den.x, 'back');
  assert.equal(h.data.games.idle, undefined);
  assert.equal(h.data.roomNames.Old?.x, undefined);
});

test('room cleanup leaves a reused room name alone', async () => {
  const old = Date.now() - 13 * 60 * 60 * 1000;
  const h = harness({
    games: { idle: { state: 'waiting', name: 'Old', pass: 'x', createdAt: old, presence: {} }, other: { state: 'waiting', createdAt: Date.now() } },
    roomNames: { Old: { x: 'other' } }
  });
  await h.exports.dailySweep();
  assert.equal(h.data.games.idle, undefined);
  assert.equal(h.data.roomNames.Old?.x, 'other');
});

test('undoing nested captures restores each earlier empire', async () => {
  const { capturePlan, releasePlan } = await import(pathToFileURL(path.join(__dirname, '../../public/captures.js')).href);
  let captures = {};
  const apply = update => Object.entries(update).forEach(([k, v]) => {
    const id = k.replace('captures/', '');
    if (v === null) delete captures[id]; else captures[id] = v;
  });
  const capture = (key, leader) => apply(capturePlan(captures, key, leader));
  const release = key => apply(releasePlan(captures, key));
  capture('A', 'B'); capture('B', 'C'); capture('C', 'D');
  release('C');
  assert.deepEqual(captures, { A: { leader: 'C', via: 'B', back: 'A' }, B: { leader: 'C', via: 'B' } });
  release('B');
  assert.deepEqual(captures, { A: { leader: 'B', via: 'A' } });
  // Single capture/undo, independent merges, and legacy records without history.
  captures = {};
  capture('A', 'B'); release('A');
  assert.deepEqual(captures, {});
  capture('A', 'B'); capture('C', 'D');
  assert.deepEqual(captures, { A: { leader: 'B', via: 'A' }, C: { leader: 'D', via: 'C' } });
  captures = { A: { leader: 'C', via: 'B' }, B: { leader: 'C', via: 'B' } };
  release('B');
  assert.deepEqual(captures, {});
});
