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
function client(uid) {
  const app = initializeApp({
    projectId: namespace, databaseURL: `https://${namespace}.firebaseio.com`,
    databaseAuthVariableOverride: { uid }
  }, `rules-${uid}`);
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
