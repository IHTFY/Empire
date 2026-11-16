const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('../functions/test/support/functions.cjs');

function element() {
  return { hidden: false, value: '', textContent: '', classList: { add() {}, remove() {} },
    addEventListener() {}, querySelector: () => element() };
}

async function roomHarness({ pauseSignIn = false } = {}) {
  const elements = new Map();
  const stored = new Map([['secret:B', 'pear']]);
  const roomNames = [element(), element()];
  const events = [];
  const subscriptions = new Map();
  const reads = [];
  const delays = new Map();
  let screen = 'home';
  global.document = { location: new URL('https://example.test/'),
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    addEventListener() {}, querySelectorAll: selector => selector === '.room-name' ? roomNames : [] };
  global.history = { replaceState(_state, _title, url) { global.document.location = new URL(url); } };
  global.window = { location: { replace: url => events.push(['replace', url]) } };
  global.localStorage = { getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  global.requestAnimationFrame = () => {};
  global.firebase = { database: { ServerValue: { TIMESTAMP: 1 } } };
  const h = harness({ games: {
    A: { name: 'alpha', pass: 'ABCDEF', state: 'waiting', locked: true, roundId: 'round-a', users: { me: { real: 'Alice' } } },
    B: { name: 'bravo', pass: 'UVWXYZ', state: 'waiting', users: { me: { real: 'Bob' } } },
    C: { name: 'charlie', pass: 'GHJKMN', state: 'waiting' }
  } });
  function pause(operation, path = '') {
    const reached = Promise.withResolvers();
    const gate = Promise.withResolvers();
    delays.set(`${operation}:${path}`, { reached, gate });
    return { reached: reached.promise, release: gate.resolve };
  }
  async function wait(operation, path = '') {
    const key = `${operation}:${path}`;
    const delay = delays.get(key);
    if (!delay) return;
    delays.delete(key);
    delay.reached.resolve();
    await delay.gate.promise;
  }
  const signIn = pauseSignIn ? pause('signIn') : null;
  const value = path => path.split('/').filter(Boolean).reduce((data, part) => data?.[part], h.data);
  const db = { ref(path = '') {
    const base = h.ref(path);
    return { ...base,
      async once() {
        reads.push(path);
        const snapshot = await base.once();
        await wait('read', path);
        return snapshot;
      },
      async update(updates) { await wait('update', path); return base.update(updates); },
      on(_type, callback) {
        if (!subscriptions.has(path)) subscriptions.set(path, new Set());
        subscriptions.get(path).add(callback);
        callback(h.snapshot(path === '.info/connected' ? false : value(path)));
      },
      off(_type, callback) { subscriptions.get(path).delete(callback); },
      onDisconnect: () => ({ cancel: () => wait('cancel', path) })
    };
  } };
  const { createRooms } = await import('../public/rooms.js');
  const record = name => (...args) => events.push([name, ...args]);
  const rooms = createRooms({ db, ensureSignedIn: () => wait('signIn'), getUid: () => 'me',
    ui: { show: next => { screen = next; }, toast: record('toast'), fitMarquees() {}, markHomeFormStale: record('stale') },
    audio: { chime: record('chime') },
    onChange: record('change'), onDetach: record('detach'), onRoundReset: record('reset'), onEnter: record('enter'),
    onUsers: record('users'), onEliminated: snapshot => events.push(['eliminated', snapshot.val()]), onPlaybackStart: record('play'),
    onPlaybackStop: record('stop'), onRoundLocked: record('round'),
    openSetup: () => { screen = 'setup'; }, setSecret: record('secret') });
  const view = () => structuredClone({
    room: rooms.getSnapshot(), title: global.document.title, url: global.document.location.href,
    remembered: stored.get('lastRoom'), link: rooms.roomLink(), screen,
    names: roomNames.map(el => el.textContent), password: elements.get('roomPassText')?.textContent,
    listeners: [...subscriptions].filter(([, callbacks]) => callbacks.size).map(([path, callbacks]) => [path, callbacks.size]),
    events
  });
  return { rooms, pause, signIn, view, reads };
}

test('a delayed automatic room entry cannot overwrite a newer room choice', async () => {
  const { rooms, pause, view } = await roomHarness();
  const gate = pause('read', 'games/A/name');
  // Startup resume/link opening is separate from the Home form's busy flag. Delay its
  // metadata read, then choose another room through that still-usable form.
  const oldEntry = rooms.enter('A');
  await gate.reached;
  await rooms.enter('B');
  assert.equal(rooms.getSnapshot().name, 'bravo');
  const bravo = view();
  gate.release();
  await oldEntry;
  const { id, name, pass } = rooms.getSnapshot();
  assert.deepEqual({ id, name, pass }, { id: 'B', name: 'bravo', pass: 'UVWXYZ' },
    'Old entry replaced the title, remembered room, invite credentials, and URL of the newer room');
  assert.deepEqual(view(), bravo);
});

for (const path of ['games/A/users/me', 'games/A/locked']) {
  test(`a delayed ${path} read cannot change a newer room or attach listeners`, async () => {
    const { rooms, pause, view } = await roomHarness();
    const gate = pause('read', path);
    const oldEntry = rooms.enter('A');
    await gate.reached;
    await rooms.enter('B');
    const bravo = view();
    gate.release();
    await oldEntry;
    assert.deepEqual(view(), bravo);
  });
}

test('an entry waiting for sign-in cannot detach a newer room', async () => {
  const { rooms, signIn, view, reads } = await roomHarness({ pauseSignIn: true });
  const oldEntry = rooms.enter('A');
  await signIn.reached;
  await rooms.enter('B');
  const bravo = view();
  signIn.release();
  await oldEntry;
  assert.deepEqual(view(), bravo);
  assert.ok(!reads.some(path => path.startsWith('games/A/')));
});

test('an entry waiting for presence cleanup cannot replace a newer room', async () => {
  const { rooms, pause, view } = await roomHarness();
  await rooms.enter('B');
  const gate = pause('cancel', 'games/B/presence/me');
  const oldEntry = rooms.enter('B');
  await gate.reached;
  await rooms.enter('A');
  await new Promise(resolve => setImmediate(resolve));
  const alpha = view();
  gate.release();
  await oldEntry;
  assert.deepEqual(view(), alpha);
});

test('a room switch waiting for departure cannot replace a newer room', async () => {
  const { rooms, pause, view, reads } = await roomHarness();
  await rooms.enter('A');
  const gate = pause('update', 'games/A');
  const oldEntry = rooms.enter('B');
  await gate.reached;
  await rooms.enter('C');
  const charlie = view();
  gate.release();
  await oldEntry;
  assert.deepEqual(view(), charlie);
  assert.ok(!reads.some(path => path.startsWith('games/B/')));
});

for (const path of ['games/A/name', 'games/A/users/me', 'games/A/locked']) {
  test(`leaving invalidates an entry waiting for ${path}`, async () => {
    const { rooms, pause, view } = await roomHarness();
    const gate = pause('read', path);
    const entry = rooms.enter('A');
    await gate.reached;
    await rooms.leave();
    const home = view();
    assert.equal(home.room.id, null);
    assert.equal(home.screen, 'home');
    assert.deepEqual(home.listeners, []);
    gate.release();
    await entry;
    assert.deepEqual(view(), home);
  });
}

test('leaving before sign-in invalidates entry even without a current room', async () => {
  const { rooms, signIn, view, reads } = await roomHarness({ pauseSignIn: true });
  const entry = rooms.enter('A');
  await signIn.reached;
  await rooms.leave();
  const home = view();
  signIn.release();
  await entry;
  assert.deepEqual(view(), home);
  assert.deepEqual(reads, []);
});

test('late departure cleanup cannot send a newer room back home', async () => {
  const { rooms, pause, view } = await roomHarness();
  await rooms.enter('A');
  const gate = pause('update', 'games/A');
  const leaving = rooms.leave();
  await gate.reached;
  await rooms.enter('B');
  const bravo = view();
  gate.release();
  await leaving;
  assert.deepEqual(view(), bravo);
});

test('a delayed round lookup cannot mark a departed room as finished', async () => {
  const { rooms, pause, view } = await roomHarness();
  const gate = pause('read', 'games/A/roundId');
  await rooms.enter('A');
  await gate.reached;
  await rooms.enter('B');
  const bravo = view();
  gate.release();
  // Flush the read continuation and its round callback.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(view(), bravo);
});

test('a newer entry to the same room also supersedes a pending entry', async () => {
  const { rooms, pause, view } = await roomHarness();
  const gate = pause('read', 'games/A/name');
  const oldEntry = rooms.enter('A');
  await gate.reached;
  await rooms.enter('A');
  await new Promise(resolve => setImmediate(resolve));
  const alpha = view();
  gate.release();
  await oldEntry;
  assert.deepEqual(view(), alpha);
});
