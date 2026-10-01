const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!host) throw new Error('Start the database emulator and set FIREBASE_DATABASE_EMULATOR_HOST to run rule checks.');
const namespace = 'demo-empire-rules';
const apps = [];
function client(uid, name = uid) {
  const app = initializeApp({
    projectId: namespace, databaseURL: `https://${namespace}.firebaseio.com`,
    databaseAuthVariableOverride: { uid }
  }, `rules-${name}`);
  apps.push(app);
  return getDatabase(app);
}
const alice = client('alice');
const outsider = client('outsider');
async function request(target, method, body, admin = false) {
  return fetch(`http://${host}/${target}.json?ns=${namespace}`, {
    method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
const player = name => ({ real: name, clan: name });
async function seed(id, extra = {}) {
  const response = await request(`games/${id}`, 'PUT', {
    state: 'waiting', name: id, pass: 'ABCDEF', users: { alice: player('Alice'), bob: player('Bob') },
    secrets: { alice: 'otter', bob: 'apple' }, ...extra
  }, true);
  assert.equal(response.status, 200);
}
before(async () => {
  await request('', 'DELETE', undefined, true);
  const rules = fs.readFileSync(path.join(__dirname, '../../database.rules.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const response = await request('.settings/rules', 'PUT', JSON.parse(rules), true);
  assert.equal(response.status, 200, await response.text());
});
after(async () => { await Promise.all(apps.map(app => deleteApp(app))); });

test('outsiders cannot reset, end, interrupt, or delete a room', async () => {
  await seed('controls', { state: 'playing', startedAt: Date.now(), revealEndsAt: Date.now() + 8000, names: ['otter', 'apple'], locked: true });
  await Promise.all(['resetting', 'deleting', 'waiting'].map(async state => {
    assert.equal((await request('games/controls/state', 'PUT', state)).status, 401);
    await assert.rejects(outsider.ref('games/controls/state').set(state), /permission/i);
  }));
  await assert.rejects(alice.ref('games/controls/state').set('waiting'), /permission/i);
  assert.equal((await request('games/controls', 'DELETE')).status, 401);
  await assert.rejects(outsider.ref('games/controls').remove(), /permission/i);
  await alice.ref('games/controls/state').set('deleting');
  assert.equal((await request('games/controls', 'DELETE')).status, 401);
  await assert.rejects(outsider.ref('games/controls').remove(), /permission/i);
  await alice.ref('games/controls').remove();
});

test('members may reset; client bulk cleanup and reopening are denied', async () => {
  await seed('reset');
  await alice.ref('games/reset/state').set('resetting');
  await assert.rejects(alice.ref('games/reset/state').set('waiting'), /permission/i);
  await assert.rejects(outsider.ref('games/reset/users').remove(), /permission/i);
  await assert.rejects(outsider.ref('games/reset/secrets').remove(), /permission/i);
});

test('only a member can complete an elapsed reveal', async () => {
  await seed('complete', { state: 'playing', names: ['otter', 'apple'], startedAt: Date.now() - 9000, revealEndsAt: Date.now() - 1000, locked: true });
  await assert.rejects(outsider.ref('games/complete/state').set('waiting'), /permission/i);
  await alice.ref('games/complete/state').set('waiting');
});

test('public invitation lookup, authenticated room creation, and joining remain usable', async () => {
  const id = '-review-room-0000001';
  await alice.ref().update({
    [`games/${id}`]: { state: 'waiting', createdAt: Date.now(), name: 'public-invite', pass: 'ABCDEF' },
    'roomNames/public-invite/ABCDEF': id
  });
  assert.equal((await request('roomNames/public-invite/ABCDEF', 'GET')).status, 200);
  assert.equal((await request(`games/${id}/state`, 'GET')).status, 200);
  await outsider.ref(`games/${id}`).update({ 'users/outsider': player('Guest'), 'secrets/outsider': 'pear' });
  await outsider.ref(`games/${id}/state`).set('resetting');
});


test('only members can manage bots or remove offline players', async () => {
  await seed('players', { presence: { bob: { online: false, lastSeen: Date.now() - 700000 } } });
  const bot = { real: 'Bot', clan: 'Bot', fakeBadge: true };
  const add = { 'users/bot': bot, 'secrets/bot': 'robot' };
  await assert.rejects(outsider.ref('games/players').update(add), /permission/i);
  await alice.ref('games/players').update(add);
  await assert.rejects(outsider.ref('games/players/users/bot').remove(), /permission/i);
  await assert.rejects(outsider.ref('games/players/users/bob').remove(), /permission/i);
  await alice.ref('games/players').update({ 'users/bot': null, 'secrets/bot': null });
  await alice.ref('games/players').update({ 'users/bob': null, 'secrets/bob': null });
});

test('a start transaction freezes submissions and admits only one concurrent claim', async () => {
  const { harness } = require('./support/functions.cjs');
  const app = initializeApp({ projectId: namespace, databaseURL: `https://${namespace}.firebaseio.com` }, 'rules-admin');
  apps.push(app);
  const database = getDatabase(app);
  await seed('race');
  let calls = 0;
  const h = harness({}, { recordNames: () => { calls++; return { ready: Promise.resolve({}), done: Promise.resolve() }; } }, { database });
  await Promise.all([1, 2].map(() => h.exports.flashNames({ text: 'race' }, { auth: { uid: 'alice' } })));
  const room = (await database.ref('games/race').once('value')).val();
  assert.equal(calls, 1);
  assert.equal(room.locked, true);
  assert.equal(room.state, 'playing');
  assert.deepEqual([...room.names].sort(), ['apple', 'otter']);
  await assert.rejects(outsider.ref('games/race').update({ 'users/outsider': player('Guest'), 'secrets/outsider': 'pear' }), /permission/i);
  await assert.rejects(alice.ref('games/race/secrets/alice').set('tiger'), /permission/i);
  await seed('reset-submit', { state: 'resetting' });
  await assert.rejects(outsider.ref('games/reset-submit').update({ 'users/outsider': player('Guest'), 'secrets/outsider': 'pear' }), /permission/i);
});

test('reveal ownership stays private while the playback indexes remain public', async () => {
  await seed('private-owners', { locked: true, names: ['otter', 'apple'], nameOwners: ['alice', 'bob'], replay: { indexes: [0, 1], count: 2 } });
  assert.equal((await request('games/private-owners/nameOwners', 'GET')).status, 401);
  await assert.rejects(alice.ref('games/private-owners/nameOwners').once('value'), /permission/i);
  assert.equal((await request('games/private-owners/replay', 'GET')).status, 200);
  await assert.rejects(alice.ref('games/private-owners').update({ 'eliminated/bob': true }), /permission/i);
});

async function pollPresence(id, predicate) {
  for (let i = 0; i < 100; i++) {
    // Polling must observe the preceding disconnect; these requests are deliberately sequential.
    // eslint-disable-next-line no-await-in-loop
    const response = await request(`games/${id}/presence/alice`, 'GET');
    // eslint-disable-next-line no-await-in-loop
    const entry = await response.json();
    if (predicate(entry)) return entry;
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Presence did not reach the expected state');
}

test('disconnecting one socket preserves another; removal waits for the final disconnect', async () => {
  await seed('multitab');
  const a = client('alice', 'tab-a');
  const b = client('alice', 'tab-b');
  const bob = client('bob');
  const refs = [a, b].map(db => db.ref('games/multitab/presence/alice'));
  await Promise.all(refs.map(async (ref, i) => {
    const key = i === 0 ? 'a' : 'b';
    await ref.update({ version: 2, name: 'Alice', lastSeen: { '.sv': 'timestamp' } });
    await ref.onDisconnect().update({ version: 2, [`connections/${key}`]: null, lastSeen: { '.sv': 'timestamp' } });
    await ref.update({ version: 2, lastSeen: { '.sv': 'timestamp' }, name: 'Alice', [`connections/${key}`]: { away: i === 0, name: 'Alice' } });
  }));
  // Even an old timestamp cannot make a player removable while a connection remains.
  await request('games/multitab/presence/alice/lastSeen', 'PUT', Date.now() - 700000, true);
  await assert.rejects(bob.ref('games/multitab/users/alice').remove(), /permission/i);
  await assert.rejects(alice.ref('games/multitab/presence/alice').set({ online: false, away: false, lastSeen: Date.now() }), /permission/i);
  b.goOffline();
  const one = await pollPresence('multitab', entry => entry.connections?.a && !entry.connections?.b);
  assert.equal(one.version, 2);
  assert.equal((await a.ref('.info/connected').once('value')).val(), true);
  await assert.rejects(bob.ref('games/multitab/users/alice').remove(), /permission/i);
  a.goOffline();
  const none = await pollPresence('multitab', entry => !entry.connections);
  assert(Date.now() - none.lastSeen < 5000);
  await assert.rejects(bob.ref('games/multitab/users/alice').remove(), /permission/i);
  // Model the ten-minute offline threshold without a ten-minute test delay.
  await request('games/multitab/presence/alice/lastSeen', 'PUT', Date.now() - 700000, true);
  await bob.ref('games/multitab').update({ 'users/alice': null, 'secrets/alice': null });
});

test('members can remove a watcher with connection entries but cannot remove a connected player', async () => {
  await seed('watchers');
  await outsider.ref('games/watchers/presence/outsider').update({ version: 2, lastSeen: Date.now(), connections: { tab: { away: false, name: 'Guest' } } });
  await alice.ref('games/watchers/presence/outsider').remove();
  await alice.ref('games/watchers/presence/alice').update({ version: 2, lastSeen: Date.now(), connections: { tab: { away: false, name: 'Alice' } } });
  await assert.rejects(outsider.ref('games/watchers/presence/alice').remove(), /permission/i);
});

test('members capture humans into an uncaptured leader\'s empire after the reveal', async () => {
  await seed('capture', { locked: true, users: { alice: player('Alice'), bob: player('Bob'), cara: player('Cara'), bot: { ...player('Bot'), fakeBadge: true } } });
  const claim = (key, leader, via = key) => alice.ref(`games/capture/captures/${key}`).set({ leader, via });
  await assert.rejects(outsider.ref('games/capture/captures/bob').set({ leader: 'alice', via: 'bob' }), /permission/i);
  await assert.rejects(claim('bot', 'alice'), /permission/i);
  await assert.rejects(claim('bob', 'bot'), /permission/i);
  await assert.rejects(claim('bob', 'bob'), /permission/i);
  await claim('bob', 'alice');
  await assert.rejects(claim('cara', 'bob'), /permission/i);
  await alice.ref('games/capture').update({ 'captures/alice': { leader: 'cara', via: 'alice' }, 'captures/bob': { leader: 'cara', via: 'alice' } });
  await alice.ref('games/capture').update({ 'captures/alice': null, 'captures/bob': null });
  await seed('capture-early', { locked: false });
  await assert.rejects(alice.ref('games/capture-early/captures/bob').set({ leader: 'alice', via: 'bob' }), /permission/i);
});
