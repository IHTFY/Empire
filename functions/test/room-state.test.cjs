const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./support/functions.cjs');

test('server reset clears the roster and opens a room without requiring remaining members', async () => {
  const h = harness({ games: { room: { state: 'resetting', users: { alice: { real: 'Alice' } }, secrets: { alice: 'otter' }, names: ['otter'], voice: { 0: 'clip' }, locked: true, startedAt: 1, eliminated: { bot: true }, name: 'room', pass: 'ABCDEF', presence: { alice: { online: true } } } } });
  await h.exports.roomState({ before: h.snapshot('waiting'), after: h.snapshot('resetting') }, { params: { gameId: 'room' } });
  const room = h.data.games.room;
  assert.equal(room.state, 'waiting');
  for (const key of ['users', 'secrets', 'names', 'voice', 'locked', 'startedAt', 'eliminated']) assert.equal(room[key], undefined);
  assert.equal(room.name, 'room');
  assert.equal(room.pass, 'ABCDEF');
  assert.equal(room.presence.alice.online, true);
});

test('delayed reset handler cannot clear an already reopened room or recreate a deleted room', async () => {
  const h = harness({ games: { room: { state: 'waiting', users: { alice: { real: 'New Alice' } }, secrets: { alice: 'pear' } } } });
  const event = { before: h.snapshot('playing'), after: h.snapshot('resetting') };
  await h.exports.roomState(event, { params: { gameId: 'room' } });
  assert.equal(h.data.games.room.secrets.alice, 'pear');
  await h.ref('games/room').set(null);
  await h.exports.roomState(event, { params: { gameId: 'room' } });
  assert.equal(h.data.games.room, undefined);
});
