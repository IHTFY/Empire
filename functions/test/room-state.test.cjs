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

test('a revealed room that its last player leaves opens the next round', async () => {
  const room = extra => ({
    state: 'waiting', locked: true, name: 'room', pass: 'ABCDEF', names: ['otter'], startedAt: 1,
    users: { '-NbotKey000000000001': { real: 'Bot', clan: 'Bot', fakeBadge: true } },
    secrets: { '-NbotKey000000000001': 'apple' }, captures: { x: { leader: 'y', via: 'x' } }, ...extra
  });
  const left = { params: { gameId: 'room', userId: 'alice' } };
  const h = harness({ games: { room: room() } });
  await h.exports.roomEmptied(h.snapshot({ real: 'Alice', clan: 'Alice' }), left);
  const game = h.data.games.room;
  assert.equal(game.state, 'waiting');
  for (const key of ['users', 'secrets', 'names', 'locked', 'startedAt', 'captures']) assert.equal(game[key], undefined);
  assert.equal(game.name, 'room');

  // A player still in the room, a room that is not revealed, or one already closing stays as it is.
  await Promise.all([
    { users: { bob: { real: 'Bob', clan: 'Bob' } } },
    { locked: undefined },
    { state: 'resetting' },
    { state: 'deleting' }
  ].map(async extra => {
    const other = harness({ games: { room: room(extra) } });
    const before = structuredClone(other.data.games.room);
    await other.exports.roomEmptied(other.snapshot({ real: 'Alice', clan: 'Alice' }), left);
    assert.deepEqual(other.data.games.room, before);
  }));
  // A deleted room stays deleted.
  const gone = harness({ games: {} });
  await gone.exports.roomEmptied(gone.snapshot({ real: 'Alice', clan: 'Alice' }), left);
  assert.equal(gone.data.games.room, undefined);
});
