const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./support/functions.cjs');

async function boot(port, existingProject) {
  const calls = [];
  let options = existingProject ? { projectId: existingProject } : null;
  const firebase = {
    apps: options ? [{}] : [],
    initializeApp: value => { options = value; calls.push(['initialize', value]); },
    app: () => ({ options }),
    auth: () => ({ useEmulator: (...args) => calls.push(['auth', ...args]) }),
    database: () => ({ useEmulator: (...args) => calls.push(['database', ...args]) }),
    functions: () => ({ useEmulator: (...args) => calls.push(['functions', ...args]) })
  };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/firebase-emulators.js'), 'utf8'), {
    firebase, window, document: { createElement: () => ({}), head: { appendChild: script => { calls.push(['script', script.src]); script.onload(); } } }, location: { port, hostname: 'localhost' }
  });
  await window.empireFirebaseReady;
  return calls;
}

test('the local Hosting port initializes and routes every Firebase service to the demo emulators', async () => {
  const calls = await boot('15000');
  assert.equal(calls[0][1].projectId, 'demo-empire-local');
  assert.equal(calls[0][1].databaseURL, 'https://demo-empire-local-default-rtdb.firebaseio.com');
  assert.equal(calls[1][0], 'auth');
  assert.equal(calls[1][1], 'http://localhost:19099');
  assert.deepEqual(calls[2], ['database', 'localhost', 19000]);
  assert.deepEqual(calls[3], ['functions', 'localhost', 15001]);
});

test('normal Hosting initialization is unchanged and a live project cannot be used at the local port', async () => {
  assert.deepEqual(await boot('', 'empire-ihtfy'), []);
  assert.deepEqual(await boot(''), [['script', '/__/firebase/init.js']]);
  await assert.rejects(boot('15000', 'empire-ihtfy'), /demo Firebase project/);
});

test('emulated speech uses fallback without contacting the external speech service', async () => {
  const h = harness({}, {}, {
    process: { env: { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-empire-local' } },
    fetch: () => { throw new Error('External speech request was attempted'); }
  });
  assert.equal(await h.evaluate("recording('otter')"), null);
  assert.deepEqual(h.data, {});
});
