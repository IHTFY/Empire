const assert = require('node:assert/strict');
const { test } = require('node:test');

// Mounts the real reveal controller with fake elements, audio and database.
async function mount() {
  const elements = new Map();
  const element = () => ({
    hidden: true, textContent: '', innerHTML: '', style: {}, dataset: {}, clientWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, querySelector: () => element(), replaceChildren() {}
  });
  global.document = { getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, querySelectorAll: () => [] };
  global.ResizeObserver = class { observe() {} };
  const room = { id: 'A', state: 'waiting', users: {} };
  const spoken = [];
  const audio = { speak: text => spoken.push(text), tick() {}, chime() {}, clearClips() {}, isVoiceEnabled: () => false };
  const db = { ref: () => ({ on() {}, off() {}, once: async () => ({ val: () => null }) }) };
  const { createReveal } = await import('../public/reveal.js?' + Math.random());
  const reveal = createReveal({ db, flashNames() {}, getRoom: () => room, audio, ui: { toast() {}, rollNumber() {} }, refreshLobby() {} });
  const screen = id => global.document.getElementById(id);
  const snapshot = value => ({ val: () => value });
  const remove = (key, name) => reveal.observeEliminated(snapshot({ [key]: { name, at: Date.now() } }));
  return { reveal, room, spoken, screen, remove };
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
