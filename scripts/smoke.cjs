const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const requireFunctions = createRequire(path.join(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getDatabase } = requireFunctions('firebase-admin/database');

const project = 'demo-empire-local';
const namespace = `${project}-default-rtdb`;
const dbHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!dbHost || !authHost) throw new Error('Run this scenario with pnpm test:integration.');
const apps = [];
async function signIn(name) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
  });
  assert.equal(response.status, 200);
  const user = await response.json();
  const app = initializeApp({ projectId: project, databaseURL: `https://${namespace}.firebaseio.com`, databaseAuthVariableOverride: { uid: user.localId } }, name);
  apps.push(app);
  return { uid: user.localId, token: user.idToken, db: getDatabase(app) };
}
async function call(user, gameId) {
  const response = await fetch(`http://127.0.0.1:15001/${project}/us-central1/flashNames`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ data: { text: gameId } })
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.result, true);
}
async function read(target, admin = false) {
  const response = await fetch(`http://${dbHost}/${target}.json?ns=${namespace}`, { headers: admin ? { Authorization: 'Bearer owner' } : {} });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function waitFor(target, predicate) {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    const value = await read(target, true);
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${target}`);
}
async function join(user, id, name, secret) {
  await user.db.ref(`games/${id}`).update({ [`users/${user.uid}`]: { real: name, clan: name }, [`secrets/${user.uid}`]: secret });
}
async function run() {
  const hosting = await fetch('http://127.0.0.1:15000');
  assert.equal(hosting.status, 200);
  const html = await hosting.text();
  assert.match(html, /firebase-emulators\.js/);
  // Check the actual bundles, since Hosting rewrites missing assets to index.html.
  for (const [asset, type] of [['script.js', 'javascript'], ['style.css', 'css']]) {
    assert.ok(html.includes(`assets/${asset}`));
    const response = await fetch(`http://127.0.0.1:15000/assets/${asset}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type')?.includes(type), `Missing built asset: ${asset}`);
  }
  const [alice, bob, outsider] = await Promise.all(['alice', 'bob', 'outsider'].map(signIn));
  const id = alice.db.ref('games').push().key;
  const name = `smoke-${Date.now()}`;
  await alice.db.ref().update({
    [`games/${id}`]: { state: 'waiting', createdAt: Date.now(), name, pass: 'ABCDEF' },
    [`roomNames/${name}/ABCDEF`]: id
  });
  assert.equal(await read(`roomNames/${name}/ABCDEF`), id);
  await Promise.all([join(alice, id, 'Alice', 'otter'), join(bob, id, 'Bob', 'apple')]);
  await assert.rejects(outsider.db.ref(`games/${id}/state`).set('resetting'), /permission/i);
  await assert.rejects(outsider.db.ref(`games/${id}/state`).set('deleting'), /permission/i);
  await call(alice, id);
  const first = await waitFor(`games/${id}`, room => room?.state === 'playing');
  assert.deepEqual([...first.names].sort(), ['apple', 'otter']);
  assert.equal(first.locked, true);
  assert.equal(first.replay.count, 2);
  assert.equal(first.voice, undefined);
  await assert.rejects(alice.db.ref(`games/${id}/nameOwners`).once('value'), /permission/i);
  await assert.rejects(alice.db.ref(`games/${id}/state`).set('waiting'), /permission/i);
  await assert.rejects(join(outsider, id, 'Late Guest', 'pear'), /permission/i);
  await alice.db.ref(`games/${id}/state`).set('resetting');
  await waitFor(`games/${id}`, room => room?.state === 'waiting' && !room.users && !room.locked);
  await Promise.all([join(alice, id, 'Alice', 'tiger'), join(bob, id, 'Bob', 'pear')]);
  await call(bob, id);
  const second = await waitFor(`games/${id}`, room => room?.state === 'playing');
  assert.deepEqual([...second.names].sort(), ['pear', 'tiger']);
  assert.notEqual(second.roundId, first.roundId);
  await bob.db.ref(`games/${id}/state`).set('deleting');
  await bob.db.ref().update({ [`games/${id}`]: null, [`roomNames/${name}/ABCDEF`]: null });
  assert.equal(await read(`games/${id}/state`), null);
  console.log('Whole-game smoke passed: create, invitation lookup, join, authenticated reveal, outsider denial, reset, new round, and end.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await Promise.all(apps.map(app => deleteApp(app))); });
