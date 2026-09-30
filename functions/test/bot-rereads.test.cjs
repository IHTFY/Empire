const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./support/functions.cjs');

function room() {
  return { state: 'waiting', locked: true, roundId: 'round', users: { alice: { real: 'Alice' }, bob: { real: 'Bob' } },
    names: ['shared', 'apple', 'shared', 'robot'], nameOwners: ['bot', 'alice', 'bob', 'second-bot'],
    voice: { 0: 'clip-bot', 1: 'clip-alice', 2: 'clip-bob', 3: 'clip-second' }, eliminated: { bot: true } };
}
async function start(h) { await h.exports.flashNames({ text: 'room' }, { auth: { uid: 'alice' } }); }

test('rereads exclude the exact eliminated bot occurrence while preserving audio indexes', async () => {
  const h = harness({ games: { room: room() } }, { recording: async () => null });
  await h.exports.revealRemoved(h.snapshot('shared'), { params: { gameId: 'room', userId: 'bot' } });
  assert.equal(h.data.games.room.eliminated.bot.name, 'shared');
  await start(h);
  assert.deepEqual(h.data.games.room.replay.indexes, [1, 2, 3]);
  assert.deepEqual(h.data.games.room.names, ['shared', 'apple', 'shared', 'robot']);
  assert.equal(h.data.games.room.voice[2], 'clip-bob');
  assert.equal(h.data.games.room.replay.count, 3);
  await h.ref('games/room/state').set('waiting');
  await start(h);
  assert.deepEqual(h.data.games.room.replay.indexes, [1, 2, 3]);
});

test('a removed bot is excluded before its asynchronous announcement finishes', async () => {
  const h = harness({ games: { room: room() } });
  await start(h);
  assert.deepEqual(h.data.games.room.replay.indexes, [1, 2, 3]);
  await h.ref('games/room').update({ state: 'waiting', 'eliminated/second-bot': true });
  await start(h);
  assert.deepEqual(h.data.games.room.replay.indexes, [1, 2]);
});

test('legacy rereads remove one occurrence per announcement without accumulating removals', async () => {
  const previous = room();
  delete previous.nameOwners;
  previous.eliminated.bot = { name: 'shared', at: 1 };
  const h = harness({ games: { room: previous } });
  await start(h);
  assert.deepEqual(h.data.games.room.replay.indexes, [1, 2, 3]);
  await h.ref('games/room/state').set('waiting');
  await start(h);
  assert.deepEqual(h.data.games.room.replay.indexes, [1, 2, 3]);
});

test('human removal never publishes a secret and a reset clears playback ownership', async () => {
  const h = harness({ games: { room: room() } }, { recording: async () => null });
  await h.exports.revealRemoved(h.snapshot('apple'), { params: { gameId: 'room', userId: 'alice' } });
  assert.equal(h.data.games.room.eliminated.alice, undefined);
  await h.ref('games/room/state').set('resetting');
  await h.exports.roomState({ before: h.snapshot('waiting'), after: h.snapshot('resetting') }, { params: { gameId: 'room' } });
  for (const key of ['names', 'nameOwners', 'replay', 'eliminated']) assert.equal(h.data.games.room[key], undefined);
});
