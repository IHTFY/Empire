const assert = require('node:assert/strict');
const { test } = require('node:test');

// Mounts the real reveal controller with fake elements, audio and database.
async function mount({ uid = 'me', users = {}, startedAt = null } = {}) {
  const elements = new Map();
  const element = () => ({
    hidden: true, textContent: '', innerHTML: '', style: { setProperty() {} }, dataset: {}, clientWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, querySelector: () => element(), replaceChildren() {}
  });
  global.document = { getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, querySelectorAll: () => [] };
  global.ResizeObserver = class { observe() {} };
  const room = { id: 'A', state: 'waiting', users };
  const spoken = [];
  const audio = { speak: text => spoken.push(text), tick() {}, chime() {}, clearClips() {}, isVoiceEnabled: () => false };
  const writes = [];
  const stored = { 'games/A/startedAt': startedAt, 'games/A/names': startedAt === null ? null : ['apple'] };
  const db = {
    ref: path => ({
      on() {}, off() {},
      once: async () => ({ val: () => stored[path] ?? null }),
      set: async value => { writes.push([path, value]); }
    })
  };
  const { createReveal } = await import('../public/reveal.js?' + Math.random());
  const reveal = createReveal({ db, flashNames() {}, getRoom: () => room, getUid: () => uid, audio, ui: { toast() {}, rollNumber() {} }, refreshLobby() {} });
  const screen = id => global.document.getElementById(id);
  const snapshot = value => ({ val: () => value });
  const remove = (key, name) => reveal.observeEliminated(snapshot({ [key]: { name, at: Date.now() } }));
  return { reveal, room, spoken, screen, remove, writes };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test('canceling hides an active bot announcement immediately and stops its timers', async () => {
  const t = await mount();
  t.remove('bot1', 'apple');
  await tick();
  assert.equal(t.screen('eliminatedScreen').hidden, false);
  t.room.id = null;
  t.reveal.cancelAnnouncements();
  assert.equal(t.screen('eliminatedScreen').hidden, true);
  await tick();
  assert.equal(t.screen('eliminatedScreen').hidden, true);
});

test('queued old-round announcements never show, and a newer one is not hidden by old cleanup', async () => {
  const t = await mount();
  t.remove('bot1', 'apple');
  t.remove('bot2', 'pear');
  await tick();
  assert.deepEqual(t.spoken, ['apple']);
  // A new round starts in the same room: both old announcements are invalidated.
  t.reveal.resetAnnouncements();
  await tick();
  assert.equal(t.screen('eliminatedScreen').hidden, true);
  t.remove('bot3', 'plum');
  await tick();
  assert.deepEqual(t.spoken, ['apple', 'plum']);
  assert.equal(t.screen('eliminatedScreen').hidden, false);
});

test('a second announcement waits for the first', async () => {
  const t = await mount();
  t.remove('bot1', 'apple');
  t.remove('bot2', 'pear');
  await tick();
  assert.deepEqual(t.spoken, ['apple']);
  assert.equal(t.screen('eliminatedScreen').hidden, false);
});

test('canceling a capture announcement hides it and ends its animation', async () => {
  const t = await mount();
  const { botCrest } = await import('../public/crest.js');
  t.reveal.announceCapture({ name: 'Ann', crest: botCrest('a'), captor: 'Bo', captorCrest: botCrest('b'), moved: 2, captorSize: 4 });
  await tick();
  assert.equal(t.screen('captureScreen').hidden, false);
  t.reveal.cancelAnnouncements();
  assert.equal(t.screen('captureScreen').hidden, true);
  await tick();
  assert.equal(t.screen('captureScreen').hidden, true);
});

// The rules only let players move a room back to waiting, so only players should try.
async function finishReveal(options) {
  const t = await mount({ startedAt: Date.now() - 60000, ...options });
  t.room.state = 'playing';
  await t.reveal.play();
  await tick();
  return t;
}

test('a player sends the room back to waiting when the reveal ends', async () => {
  const t = await finishReveal({ uid: 'me', users: { me: { real: 'Me' }, other: { real: 'Ola' } } });
  assert.deepEqual(t.writes, [['games/A/state', 'waiting']]);
});

test('a spectator does not try to send the room back to waiting', async () => {
  const t = await finishReveal({ uid: 'watcher', users: { other: { real: 'Ola' } } });
  assert.deepEqual(t.writes, []);
});
