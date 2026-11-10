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
const bobCaptures = client('bob', 'bob-captures');
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

test('crest saves accept legacy, trim, emblem color and tone formats, rejecting malformed parts', async () => {
  await seed('crest-formats');
  const crest = alice.ref('games/crest-formats/users/alice/crest');
  await Promise.all(['hoplon.crimson.plain.lion.gold', 'hoplon.crimson.plain.lion.gold.riveted', 'hoplon.crimson.plain.lion.gold.riveted.yellow', 'hoplon.lightvermilion.plain.lion.gold.riveted.darkcrimson'].map(value => crest.set(value)));
  await Promise.all([
    'hoplon.crimson.plain.lion',
    'hoplon.crimson.plain.lion.gold.riveted.yellow.extra',
    'hoplon.crimson.plain.lion.gold.a',
    'hoplon.crimson.plain.lion.gold.abcdefghijklmno',
    'hoplon.crimson.plain.lion.gold.Riveted',
    'hoplon.crimson.plain.lion.gold.riveted1',
    'hoplon.crimson.plain.lion.gold.',
    42
  ].map(value => assert.rejects(crest.set(value), /permission/i)));
});


// Bots live under push ids (public/bots.js); sign-in ids never start with "-".
const botKey = n => `-NbotKey${String(n).padStart(12, '0')}`;

test('only members can manage bots or remove offline players', async () => {
  await seed('players', { presence: { bob: { online: false, lastSeen: Date.now() - 700000 } } });
  const bot = { real: 'Bot', clan: 'Bot', fakeBadge: true };
  const key = botKey(1);
  const add = { [`users/${key}`]: bot, [`secrets/${key}`]: 'robot' };
  await assert.rejects(outsider.ref('games/players').update(add), /permission/i);
  await alice.ref('games/players').update(add);
  await assert.rejects(outsider.ref(`games/players/users/${key}`).remove(), /permission/i);
  await assert.rejects(outsider.ref('games/players/users/bob').remove(), /permission/i);
  await alice.ref('games/players').update({ [`users/${key}`]: null, [`secrets/${key}`]: null });
  await alice.ref('games/players').update({ 'users/bob': null, 'secrets/bob': null });
});

test('the bot flag only sits on bot keys, so no member can mark a player as a bot', async () => {
  const bot = { real: 'Cara', clan: 'Cara', fakeBadge: true };
  await seed('flag-other');
  // A member cannot create another player's entry as a bot, with or without a secret.
  await assert.rejects(alice.ref('games/flag-other/users/cara').set(bot), /permission/i);
  await assert.rejects(alice.ref('games/flag-other').update({ 'users/cara': bot, 'secrets/cara': 'pear' }), /permission/i);
  // A player cannot carry the flag on their own entry.
  await assert.rejects(alice.ref('games/flag-other/users/alice/fakeBadge').set(true), /permission/i);
  await assert.rejects(outsider.ref('games/flag-other').update({ 'users/outsider': { ...player('Guest'), fakeBadge: true }, 'secrets/outsider': 'pear' }), /permission/i);
  // An entry flagged before this rule cannot be used to write, remove, or announce that player.
  await seed('flag-legacy', { users: { alice: player('Alice'), bob: player('Bob'), cara: bot } });
  await assert.rejects(alice.ref('games/flag-legacy/secrets/cara').set('pear'), /permission/i);
  await seed('flag-locked', { locked: true, names: ['otter', 'apple', 'pear'], users: { alice: player('Alice'), bob: player('Bob'), cara: bot }, secrets: { alice: 'otter', bob: 'apple', cara: 'pear' } });
  await assert.rejects(alice.ref('games/flag-locked').update({ 'eliminated/cara': true, 'users/cara': null, 'secrets/cara': null }), /permission/i);
  await assert.rejects(alice.ref('games/flag-locked/eliminated/cara').set(true), /permission/i);
  await assert.rejects(alice.ref('games/flag-locked/users/cara').remove(), /permission/i);
});

test('bots on push keys can still be added, removed, and announced after the reveal', async () => {
  const key = botKey(2);
  await seed('bot-life');
  await alice.ref('games/bot-life').update({ [`users/${key}`]: { real: 'Bot', clan: 'Bot', fakeBadge: true }, [`secrets/${key}`]: 'robot' });
  await request('games/bot-life/locked', 'PUT', true, true);
  await alice.ref('games/bot-life').update({ [`eliminated/${key}`]: true, [`users/${key}`]: null, [`secrets/${key}`]: null });
  assert.equal((await alice.ref(`games/bot-life/eliminated/${key}`).once('value')).val(), true);
});

test('a new room cannot carry announcements', async () => {
  const create = (id, extra = {}) => alice.ref().update({
    [`games/${id}`]: { state: 'waiting', createdAt: Date.now(), name: id.slice(1), pass: 'ABCDEF', ...extra },
    [`roomNames/${id.slice(1)}/ABCDEF`]: id
  });
  await create('-forgedannounce00000');
  await assert.rejects(create('-forgedannounce00001', { eliminated: { [botKey(3)]: { name: 'gotcha', at: Date.now() + 1e12 } } }), /permission/i);
  await assert.rejects(create('-forgedannounce00002', { eliminated: { bob: true } }), /permission/i);
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
  const bob = bobCaptures;
  const clients = { alice, bob };
  const claim = (key, leader, as = clients[key] || alice) => as.ref(`games/capture/captures/${key}`).set({ leader, via: key });
  await assert.rejects(outsider.ref('games/capture/captures/bob').set({ leader: 'alice', via: 'bob' }), /permission/i);
  await assert.rejects(claim('bot', 'alice'), /permission/i);
  await assert.rejects(claim('bob', 'bot'), /permission/i);
  await assert.rejects(claim('bob', 'bob'), /permission/i);
  // Only the captured empire can put a free player in another empire.
  await assert.rejects(claim('bob', 'alice', alice), /permission/i);
  await claim('bob', 'alice');
  await assert.rejects(claim('cara', 'bob'), /permission/i);
  // Bob follows Alice, so Bob can confirm Alice's capture and move with her.
  await bob.ref('games/capture').update({ 'captures/alice': { leader: 'cara', via: 'alice' }, 'captures/bob': { leader: 'cara', via: 'alice', back: 'bob' } });
  await alice.ref('games/capture').update({ 'captures/alice': null, 'captures/bob': { leader: 'alice', via: 'bob' } });
  await assert.rejects(alice.ref('games/capture/captures/bob/extra').set('x'), /permission/i);
  await seed('capture-early', { locked: false });
  await assert.rejects(bob.ref('games/capture-early/captures/bob').set({ leader: 'alice', via: 'bob' }), /permission/i);
});

test('a departed leader\'s follower can be claimed and can lead once their record is cleared', async () => {
  const cara = client('cara', 'cara-orphans');
  await seed('orphans', {
    locked: true, users: { alice: player('Alice'), bob: player('Bob'), cara: player('Cara') },
    captures: { cara: { leader: 'bob', via: 'cara' } }
  });
  const { departurePlan, staleCaptures } = await import('../../public/captures.js');
  // Left behind, the record blocks every claim on Cara although the lobby shows her as free.
  await seed('orphans-left', { locked: true, captures: { cara: { leader: 'bob', via: 'cara' } }, users: { alice: player('Alice'), bob: player('Bob'), cara: player('Cara') } });
  await bobCaptures.ref('games/orphans-left').update({ 'users/bob': null, 'secrets/bob': null });
  await assert.rejects(alice.ref('games/orphans-left/claims/cara').set({ leader: 'alice', by: 'alice' }), /permission/i);
  // A claim that clears the record first, as pages now do, goes through.
  await alice.ref('games/orphans-left').update({
    ...staleCaptures({ cara: { leader: 'bob', via: 'cara' } }, { alice: player('Alice'), cara: player('Cara') }, ['cara', 'alice']),
    'claims/cara': { leader: 'alice', by: 'alice' }
  });
  // Bob leaves; the update clears what he led.
  await bobCaptures.ref('games/orphans').update({
    'users/bob': null, 'secrets/bob': null,
    ...departurePlan({ cara: { leader: 'bob', via: 'cara' } }, 'bob')
  });
  await alice.ref('games/orphans/claims/cara').set({ leader: 'alice', by: 'alice' });
  await alice.ref('games/orphans/claims/cara').remove();
  await alice.ref('games/orphans/captures/alice').set({ leader: 'cara', via: 'alice' });
  assert.equal((await cara.ref('games/orphans/captures/alice/leader').once('value')).val(), 'cara');
});

test('nobody outside a revealed room can join or reset it, so the server reopens it once empty', async () => {
  await seed('emptied', { locked: true, users: null, secrets: null });
  await assert.rejects(outsider.ref('games/emptied/state').set('resetting'), /permission/i);
  await assert.rejects(outsider.ref('games/emptied/users/outsider').set(player('Otto')), /permission/i);
});

test('members claim a capture that the captured empire confirms or declines', async () => {
  await seed('claims', { locked: true, users: { alice: player('Alice'), bob: player('Bob'), cara: player('Cara'), bot: { ...player('Bot'), fakeBadge: true } } });
  const bob = bobCaptures;
  const ref = key => alice.ref(`games/claims/claims/${key}`);
  await assert.rejects(outsider.ref('games/claims/claims/bob').set({ leader: 'alice', by: 'outsider' }), /permission/i);
  await assert.rejects(ref('bob').set({ leader: 'alice', by: 'bob' }), /permission/i);
  await assert.rejects(ref('bot').set({ leader: 'alice', by: 'alice' }), /permission/i);
  await assert.rejects(ref('bob').set({ leader: 'bot', by: 'alice' }), /permission/i);
  await assert.rejects(ref('bob').set({ leader: 'bob', by: 'alice' }), /permission/i);
  await ref('bob').set({ leader: 'alice', by: 'alice' });
  await bob.ref('games/claims/claims/bob').remove();
  await ref('bob').set({ leader: 'alice', by: 'alice' });
  await bob.ref('games/claims').update({ 'captures/bob': { leader: 'alice', via: 'bob' }, 'claims/bob': null });
  await assert.rejects(ref('bob').set({ leader: 'cara', by: 'alice' }), /permission/i);
  await assert.rejects(ref('cara').set({ leader: 'bob', by: 'alice' }), /permission/i);
  await seed('claims-early', { locked: false });
  await assert.rejects(alice.ref('games/claims-early/claims/bob').set({ leader: 'alice', by: 'alice' }), /permission/i);
});
