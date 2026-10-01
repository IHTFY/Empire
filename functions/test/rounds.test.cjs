const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./support/functions.cjs');
const game = () => ({ state: 'waiting', name: 'room', pass: 'ABCDEF', users: { alice: { real: 'Alice' }, bob: { real: 'Bob' } }, secrets: { alice: 'otter', bob: 'apple' } });
const start = h => h.exports.flashNames({ text: 'room' }, { auth: { uid: 'alice' } });
function pending() {
  let begin, finish;
  const began = new Promise(resolve => { begin = resolve; });
  const ready = new Promise(resolve => { finish = resolve; });
  const h = harness({ games: { room: game() } }, { recordNames: () => { begin(); return { ready, done: Promise.resolve() }; } });
  return { h, began, finish };
}

test('claim freezes the roster and prevents simultaneous starts from making two reveals', async () => {
  const { h, began, finish } = pending();
  const first = start(h);
  await began;
  const frozen = h.data.games.room;
  assert.equal(frozen.state, 'shuffling');
  assert.equal(frozen.locked, true);
  assert.deepEqual([...frozen.names].sort(), ['apple', 'otter']);
  assert.equal(typeof frozen.roundId, 'string');
  const id = frozen.revealId;
  await start(h);
  assert.equal(h.data.games.room.revealId, id);
  finish({ 0: 'clip0' });
  await first;
  assert.equal(h.data.games.room.state, 'playing');
  assert.equal(h.data.games.room.voice[0], 'clip0');
});

test('reset while preparing cancels the old reveal and leaves the next round open', async () => {
  const { h, began, finish } = pending();
  const first = start(h);
  await began;
  await h.ref('games/room/state').set('resetting');
  await h.exports.roomState({ before: h.snapshot('shuffling'), after: h.snapshot('resetting') }, { params: { gameId: 'room' } });
  await h.ref('games/room').update({ 'users/alice': { real: 'Next Alice' }, 'secrets/alice': 'pear' });
  finish({ 0: 'old-clip' });
  await first;
  assert.equal(h.data.games.room.state, 'waiting');
  assert.equal(h.data.games.room.secrets.alice, 'pear');
  for (const key of ['locked', 'names', 'voice', 'roundId', 'revealId']) assert.equal(h.data.games.room[key], undefined);
});

test('deletion while preparing cannot be undone by the pending reveal', async () => {
  const { h, began, finish } = pending();
  const first = start(h);
  await began;
  await h.ref('games/room').set(null);
  finish({ 0: 'old-clip' });
  await first;
  assert.equal(h.data.games.room, undefined);
});

test('late clips cannot enter a different reveal, a reset, or a deleted room', async () => {
  let release, deadline;
  const recording = new Promise(resolve => { release = resolve; });
  const h = harness({ games: { room: { ...game(), locked: true, roundId: 'round', revealId: 'first', state: 'playing' } } }, {
    recording: () => recording, recordSample: async () => null
  }, { setTimeout: callback => { deadline = callback; return 1; }, clearTimeout: () => {} });
  const clips = h.voice.recordNames(h.ref('games/room'), ['otter'], 'first');
  deadline();
  await clips.ready;
  await h.ref('games/room').update({ revealId: 'second', voice: { 0: 'new-clip' } });
  release('old-clip');
  await clips.done;
  assert.equal(h.data.games.room.voice[0], 'new-clip');
  const update = h.updateReveal;
  const modify = current => { current.voice = { 0: 'bad' }; return current; };
  await h.ref('games/room/state').set('resetting');
  assert.equal((await update(h.ref('games/room'), 'second', modify)).committed, false);
  await h.ref('games/room').set(null);
  assert.equal((await update(h.ref('games/room'), 'second', modify)).snapshot.exists(), false);
  assert.equal(h.data.games.room, undefined);
});

test('a stale reveal can recover with the same order and a new attempt ID', async () => {
  const previous = { ...game(), state: 'playing', locked: true, roundId: 'round', revealId: 'old', startedAt: Date.now() - 100000, names: ['otter', 'apple'], voice: { 0: 'clip' } };
  const h = harness({ games: { room: previous } });
  await start(h);
  assert.equal(h.data.games.room.roundId, 'round');
  assert.notEqual(h.data.games.room.revealId, 'old');
  assert.deepEqual(h.data.games.room.names, previous.names);
  assert.equal(h.data.games.room.voice[0], 'clip');
});

test('a room with fewer than two secrets remains open when Start is rejected', async () => {
  const previous = game();
  delete previous.secrets.bob;
  const h = harness({ games: { room: previous } });
  await assert.rejects(start(h), { code: 'failed-precondition' });
  assert.equal(h.data.games.room.state, 'waiting');
  assert.equal(h.data.games.room.locked, undefined);
});

test('a bot announcement delayed by recording cannot resurrect reset data', async () => {
  let release, reached;
  const began = new Promise(resolve => { reached = resolve; });
  const recorded = new Promise(resolve => { release = resolve; });
  const previous = { ...game(), locked: true, names: ['otter', 'apple', 'robot'], roundId: 'round', eliminated: { bot: true } };
  const h = harness({ games: { room: previous } }, { recording: () => { reached(); return recorded; } });
  const remove = h.exports.revealRemoved(h.snapshot('robot'), { params: { gameId: 'room', userId: 'bot' } });
  await began;
  await h.ref('games/room/state').set('resetting');
  await h.exports.roomState({ before: h.snapshot('waiting'), after: h.snapshot('resetting') }, { params: { gameId: 'room' } });
  release('clip');
  await remove;
  assert.equal(h.data.games.room.eliminated, undefined);
});
