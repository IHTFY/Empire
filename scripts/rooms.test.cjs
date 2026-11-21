const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('../functions/test/support/functions.cjs');

function element() {
  const handlers = new Map();
  return { hidden: false, value: '', textContent: '', dataset: {}, style: {},
    classList: { add() {}, remove() {} }, setAttribute() {}, replaceChildren() {},
    addEventListener(type, callback) { handlers.set(type, callback); },
    dispatch(type, event = {}) { return handlers.get(type)(event); },
    querySelector: () => element(), querySelectorAll: () => [], getClientRects: () => [] };
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
    addEventListener() {}, querySelector: () => element(), querySelectorAll: selector => selector === '.room-name' ? roomNames : [] };
  global.history = { state: null, replaceState(state, _title, url) { this.state = state; if (url !== undefined) global.document.location = new URL(url); } };
  global.window = { location: { replace: url => events.push(['replace', url]) }, listeners: {},
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); } };
  global.localStorage = { getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  global.requestAnimationFrame = () => {};
  global.ResizeObserver = class { observe() {} };
  global.firebase = { database: { ServerValue: { TIMESTAMP: 1 } } };
  const h = harness({ games: {
    A: { name: 'alpha', pass: 'ABCDEF', state: 'waiting', locked: true, roundId: 'round-a', users: { me: { real: 'Alice' } } },
    B: { name: 'bravo', pass: 'UVWXYZ', state: 'waiting', users: { me: { real: 'Bob' } } },
    C: { name: 'charlie', pass: 'GHJKMN', state: 'waiting' }
  }, roomNames: { alpha: { ABCDEF: 'A' }, bravo: { UVWXYZ: 'B' } } });
  function pause(operation, path = '') {
    const reached = Promise.withResolvers();
    const gate = Promise.withResolvers();
    delays.set(`${operation}:${path}`, { reached, gate });
    return { reached: reached.promise, release: gate.resolve, reject: gate.reject };
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
  const { createHome } = await import('../public/home.js');
  const home = createHome({ db, ensureSignedIn: () => wait('signIn'), enterRoom: rooms.enter,
    beginEntry: rooms.begin, isEntryCurrent: rooms.isCurrent, setRoomInUrl: rooms.setRoomInUrl,
    ui: { show: next => { screen = next; }, toast: record('toast') } });
  async function joinFromForm() {
    elements.get('modeJoin').dispatch('click');
    elements.get('userGameCode').value = 'bravo';
    elements.get('roomPass').value = 'UVWXYZ';
    await elements.get('roomForm').dispatch('submit', { preventDefault() {} });
  }
  // The stub answers a listener once, when it attaches. This sends a room's current values to
  // its listeners again, as the database does after a write.
  function deliver(code) {
    for (const [path, callbacks] of subscriptions) {
      if (path.startsWith(`games/${code}/`)) [...callbacks].forEach(callback => callback(h.snapshot(value(path))));
    }
  }
  return { rooms, home, joinFromForm, pause, signIn, view, reads, deliver, data: h.data, server: h.exports, snapshot: h.snapshot };
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

// Starts the app as if opened at /?<query>, with lastRoom saved on this device.
const opening = (query, lastRoom = null) => home => home.start({ params: new URLSearchParams(query), lastRoom, navigation: 'navigate' });

for (const [name, start, path] of [
  ['saved room', opening('', { room: 'alpha', pass: 'ABCDEF' }), 'games/A/state'],
  ['saved legacy room', opening('', { code: 'A' }), 'games/A/state'],
  ['invitation', opening('room=alpha&pass=ABCDEF'), 'roomNames/alpha/ABCDEF'],
  ['legacy invitation', opening('code=A'), 'games/A/state']
]) {
  test(`a slow ${name} lookup cannot replace the room chosen from Home`, async () => {
    const { home, joinFromForm, pause, view, data } = await roomHarness();
    const gate = pause('read', path);
    const startup = start(home);
    await gate.reached;
    await joinFromForm();
    const bravo = view();
    assert.equal(bravo.room.id, 'B');
    gate.release();
    await startup;
    assert.deepEqual(view(), bravo);
    assert.deepEqual(data.games.B.users.me, { real: 'Bob' });
  });
}

for (const [name, start, path] of [
  ['saved room', opening('', { room: 'gone', pass: 'ABCDEF' }), 'roomNames/gone/ABCDEF'],
  ['saved legacy room', opening('', { code: 'gone' }), 'games/gone/state'],
  ['invitation', opening('room=gone&pass=ABCDEF'), 'roomNames/gone/ABCDEF'],
  ['legacy invitation', opening('code=gone'), 'games/gone/state']
]) {
  test(`a slow closed ${name} lookup cannot send a newer room back home`, async () => {
    const { home, joinFromForm, pause, view } = await roomHarness();
    const gate = pause('read', path);
    const startup = start(home);
    await gate.reached;
    await joinFromForm();
    const bravo = view();
    gate.release();
    await startup;
    assert.deepEqual(view(), bravo);
  });
}

for (const [name, start] of [
  ['saved room', opening('', { room: 'alpha', pass: 'ABCDEF' })],
  ['saved legacy room', opening('', { code: 'A' })],
  ['invitation', opening('room=alpha&pass=ABCDEF')],
  ['legacy invitation', opening('code=A')]
]) {
  test(`a failed ${name} entry leaves the newer room choice open`, async () => {
    const { home, joinFromForm, pause, view } = await roomHarness();
    const gate = pause('read', 'games/A/name');
    const startup = start(home);
    await gate.reached;
    await joinFromForm();
    const bravo = view();
    assert.equal(bravo.room.id, 'B');
    gate.reject(new Error('read failed'));
    await startup;
    assert.deepEqual(view(), bravo);
  });
}

test('opening the app again goes back to the saved room', async () => {
  const { home, view } = await roomHarness();
  await opening('', { room: 'bravo', pass: 'UVWXYZ' })(home);
  assert.equal(view().room.id, 'B');
});

test('coming back to Home with the browser Back button stays on Home, also after a reload', async () => {
  const { home, view, reads } = await roomHarness();
  const lastRoom = { room: 'bravo', pass: 'UVWXYZ' };
  for (const navigation of ['back_forward', 'reload']) {
    await home.start({ params: new URLSearchParams(), lastRoom, navigation });
    assert.equal(view().screen, 'home', navigation);
    assert.equal(view().room.id, null, navigation);
    assert.deepEqual(reads, [], navigation);
  }
});

test('a Home page restored from the back/forward cache stays on Home after a reload', async () => {
  const { home, view, reads } = await roomHarness();
  global.window.listeners.pageshow.forEach(listener => listener({ persisted: true }));
  await home.start({ params: new URLSearchParams(), lastRoom: { room: 'bravo', pass: 'UVWXYZ' }, navigation: 'reload' });
  assert.equal(view().screen, 'home');
  assert.deepEqual(reads, []);
});

test('a saved room that fails to reopen is forgotten and Home shows', async () => {
  const { home, rooms, signIn, view } = await roomHarness({ pauseSignIn: true });
  rooms.setRoomInUrl('bravo', 'UVWXYZ');
  const startup = opening('', { room: 'bravo', pass: 'UVWXYZ' })(home);
  await signIn.reached;
  signIn.reject(new Error('sign-in failed'));
  await startup;
  assert.equal(view().screen, 'home');
  assert.equal(view().remembered, undefined);
});

test('a stale entry detaches its listeners and presence when the next sign-in fails', async () => {
  const { rooms, pause, view } = await roomHarness();
  const oldRead = pause('read', 'games/A/locked');
  const oldEntry = rooms.enter('A');
  await oldRead.reached;
  const signIn = pause('signIn');
  const nextEntry = rooms.enter('B');
  await signIn.reached;
  const failedEntry = assert.rejects(nextEntry, /sign-in failed/);
  signIn.reject(new Error('sign-in failed'));
  await failedEntry;
  oldRead.release();
  await oldEntry;
  assert.equal(view().room.id, null);
  assert.deepEqual(view().listeners, []);
});

const leaveFailed = view => view.events.some(([name, text]) => name === 'toast' && text === 'Could not leave the room. Try again.');

test('failed departure preserves the active room for retry', async () => {
  const { rooms, pause, view, data } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const departure = rooms.leave();
  await failed.reached;
  failed.reject(new Error('Simulated write failure'));
  await departure;
  const kept = view();
  assert.equal(kept.screen, 'lobby');
  assert.equal(kept.room.id, 'B');
  assert.ok(kept.listeners.some(([path]) => path === 'games/B/users'), 'the room view is attached again');
  assert.ok(leaveFailed(kept));
  assert.deepEqual(data.games.B.users.me, { real: 'Bob' });
  assert.equal(global.localStorage.getItem('secret:B'), 'pear');

  await rooms.leave();
  const left = view();
  assert.equal(left.screen, 'home');
  assert.equal(left.room.id, null);
  assert.deepEqual(left.listeners, []);
  assert.equal(data.games.B.users?.me, undefined);
  assert.equal(global.localStorage.getItem('secret:B'), null);
});

test('tapping Leave twice shares one departure, so a failure still reopens the room', async () => {
  const { rooms, pause, view } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const first = rooms.leave();
  await failed.reached;
  const second = rooms.leave();
  failed.reject(new Error('Simulated write failure'));
  await Promise.all([first, second]);
  const kept = view();
  assert.equal(kept.screen, 'lobby');
  assert.equal(kept.room.id, 'B');
  assert.equal(global.localStorage.getItem('secret:B'), 'pear');
});

test('a room switch whose departure fails opens the new room and keeps the old saved name', async () => {
  const { rooms, pause, view, data } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const switching = rooms.enter('C');
  await failed.reached;
  failed.reject(new Error('Simulated write failure'));
  await switching;
  const charlie = view();
  assert.equal(charlie.room.id, 'C');
  assert.equal(charlie.screen, 'setup');
  assert.ok(!leaveFailed(charlie));
  assert.deepEqual(data.games.B.users.me, { real: 'Bob' });
  assert.equal(global.localStorage.getItem('secret:B'), 'pear');
});

test('a failed departure keeps the saved name without reopening a room chosen later', async () => {
  const { rooms, pause, view, data } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const leaving = rooms.leave();
  await failed.reached;
  await rooms.enter('C');
  const charlie = view();
  failed.reject(new Error('Simulated write failure'));
  await leaving;
  assert.deepEqual(view(), charlie);
  assert.deepEqual(data.games.B.users.me, { real: 'Bob' });
  assert.equal(global.localStorage.getItem('secret:B'), 'pear');
});

test('a failed departure from a room that closed meanwhile goes home and forgets it', async () => {
  const { rooms, pause, view, data } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const departure = rooms.leave();
  await failed.reached;
  delete data.games.B;
  failed.reject(new Error('Simulated write failure'));
  await departure;
  const home = view();
  assert.equal(home.screen, 'home');
  assert.equal(home.room.id, null);
  assert.equal(home.remembered, undefined);
  assert.ok(!leaveFailed(home));
  assert.equal(global.localStorage.getItem('secret:B'), null);
});

test('a failed departure that cannot reopen the room goes home and keeps the room saved', async () => {
  const { rooms, pause, view, data } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const reopen = pause('read', 'games/B/locked');
  const departure = rooms.leave();
  await failed.reached;
  failed.reject(new Error('Simulated write failure'));
  await reopen.reached;
  reopen.reject(new Error('Simulated read failure'));
  await departure;
  const home = view();
  assert.equal(home.screen, 'home');
  assert.equal(home.room.id, null);
  assert.deepEqual(home.listeners, []);
  assert.deepEqual(JSON.parse(home.remembered), { room: 'bravo', pass: 'UVWXYZ' });
  assert.ok(home.events.some(([name, text]) => name === 'toast' && text === 'Could not leave the room.'));
  assert.deepEqual(data.games.B.users.me, { real: 'Bob' });
  assert.equal(global.localStorage.getItem('secret:B'), 'pear');
});

test('tapping Leave while the room reopens waits for it, and the next tap leaves', async () => {
  const { rooms, pause, view, data } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const first = rooms.leave();
  await failed.reached;
  const signIn = pause('signIn');
  failed.reject(new Error('Simulated write failure'));
  await signIn.reached;
  const second = rooms.leave();
  signIn.release();
  await Promise.all([first, second]);
  assert.equal(view().screen, 'lobby');
  assert.equal(view().room.id, 'B');

  await rooms.leave();
  assert.equal(view().screen, 'home');
  assert.equal(data.games.B.users?.me, undefined);
});

test('a reopening that fails cannot send a room chosen during its cleanup back home', async () => {
  const { rooms, pause, view } = await roomHarness();
  await rooms.enter('B');
  const failed = pause('update', 'games/B');
  const reopen = pause('read', 'games/B/locked');
  const departure = rooms.leave();
  await failed.reached;
  failed.reject(new Error('Simulated write failure'));
  await reopen.reached;
  const cleanup = pause('cancel', 'games/B/presence/me');
  reopen.reject(new Error('Simulated read failure'));
  await cleanup.reached;
  await rooms.enter('C');
  const charlie = view();
  cleanup.release();
  await departure;
  assert.deepEqual(view(), charlie);
});

const player = real => ({ real, clan: real });
const count = (view, name) => view.events.filter(([event]) => event === name).length;

test('someone watching a revealed room goes to name entry when its last player leaves', async () => {
  const { rooms, view, data, deliver, server, snapshot } = await roomHarness();
  data.games.D = { name: 'delta', pass: 'PQRSTU', state: 'waiting', locked: true, roundId: 'round-d', names: ['otter'], users: { zed: player('Zed') } };
  await rooms.enter('D');
  assert.equal(view().screen, 'lobby');
  // Zed leaves, and the server opens the next round without anyone asking for a reset.
  delete data.games.D.users;
  await server.roomEmptied(snapshot(player('Zed')), { params: { gameId: 'D', userId: 'zed' } });
  assert.equal(data.games.D.locked, undefined);
  deliver('D');
  const opened = view();
  assert.equal(opened.screen, 'setup');
  assert.equal(count(opened, 'reset'), 1);
  // Later values for the open round leave name entry alone.
  deliver('D');
  assert.equal(count(view(), 'reset'), 1);
});

for (const [name, code, start] of [['a player', 'A', 'lobby'], ['someone watching', 'D', 'lobby']]) {
  test(`a reset from Room options opens name entry once for ${name}`, async () => {
    const { rooms, view, data, deliver, server, snapshot } = await roomHarness();
    data.games.D = { name: 'delta', pass: 'PQRSTU', state: 'waiting', locked: true, roundId: 'round-d', names: ['otter'], users: { zed: player('Zed') } };
    await rooms.enter(code);
    assert.equal(view().screen, start);
    data.games[code].state = 'resetting';
    deliver(code);
    assert.equal(view().screen, 'setup');
    // The server then clears the round. Its unlock must not start name entry over.
    await server.roomState({ before: snapshot('waiting'), after: snapshot('resetting') }, { params: { gameId: code } });
    assert.equal(data.games[code].locked, undefined);
    deliver(code);
    const opened = view();
    assert.equal(opened.screen, 'setup');
    assert.equal(count(opened, 'reset'), 1);
    assert.equal(count(opened, 'secret'), code === 'A' ? 2 : 1);
  });
}

test('a claim from a page with an old roster keeps a capture confirmed since', async () => {
  const { rooms, view, data } = await roomHarness();
  Object.assign(data.games.A.users, { fay: player('Fay'), kim: player('Kim') });
  // This page still shows Fay in the empire of Lea, who has left.
  data.games.A.captures = { fay: { leader: 'lea', via: 'fay' } };
  await rooms.enter('A');
  // Meanwhile Fay confirmed her capture by Kim on another page.
  data.games.A.captures.fay = { leader: 'kim', via: 'fay' };
  await rooms.claimCapture('fay', 'me');
  assert.deepEqual(data.games.A.captures, { fay: { leader: 'kim', via: 'fay' } });
  assert.deepEqual(view().room.captures, { fay: { leader: 'lea', via: 'fay' } }, 'the page was still showing the old capture');
});

test('a capture from a page with an old roster keeps its leader\'s capture confirmed since', async () => {
  const { rooms, data } = await roomHarness();
  Object.assign(data.games.A.users, { fay: player('Fay'), kim: player('Kim') });
  // This page still shows Fay in the empire of Lea, who has left.
  data.games.A.captures = { fay: { leader: 'lea', via: 'fay' } };
  await rooms.enter('A');
  // Meanwhile Fay confirmed her capture by Kim on another page.
  data.games.A.captures.fay = { leader: 'kim', via: 'fay' };
  await rooms.capturePlayer('me', 'fay');
  assert.deepEqual(data.games.A.captures.fay, { leader: 'kim', via: 'fay' });
});

test('a claim or capture still clears a record the room has not replaced', async () => {
  const { rooms, data } = await roomHarness();
  Object.assign(data.games.A.users, { fay: player('Fay'), kim: player('Kim') });
  data.games.A.captures = { fay: { leader: 'lea', via: 'fay' }, kim: { leader: 'lea', via: 'kim' } };
  await rooms.enter('A');
  await rooms.claimCapture('fay', 'me');
  assert.deepEqual(data.games.A.captures, { kim: { leader: 'lea', via: 'kim' } });
  assert.deepEqual(data.games.A.claims, { fay: { leader: 'me', by: 'me' } });
  await rooms.capturePlayer('me', 'kim');
  assert.deepEqual(data.games.A.captures, { me: { leader: 'kim', via: 'me' } });
});
