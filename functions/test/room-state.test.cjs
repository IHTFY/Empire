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
    { users: { bob: { real: 'Bob', clan: 'Bob' } }, captures: {} },
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

test('the deletion trigger repairs captures left by an older page and preserves the next Undo', async () => {
  const { capturePlan, departurePlan, releasePlan } = await import('../../public/captures.js');
  const users = Object.fromEntries(['alice', 'bob', 'cara', 'dan'].map(id => [id, { real: id, clan: id }]));
  const h = harness({ games: { room: { state: 'waiting', locked: true, users } } });
  const room = h.ref('games/room');
  await room.update(capturePlan({}, 'alice', 'bob'));
  await room.update(capturePlan(h.data.games.room.captures, 'bob', 'cara'));
  await room.update(capturePlan(h.data.games.room.captures, 'cara', 'dan'));
  const before = structuredClone(h.data.games.room.captures);
  const expected = departurePlan(before, 'bob');
  await room.update({ 'users/bob': null });
  await h.exports.roomEmptied(h.snapshot(users.bob), { params: { gameId: 'room', userId: 'bob' } });
  const game = h.data.games.room;
  for (const [path, capture] of Object.entries(expected)) {
    const id = path.slice('captures/'.length);
    assert.deepEqual(game.captures[id], capture === null ? undefined : capture);
  }
  assert.deepEqual(game.captures.alice, { leader: 'dan', via: 'cara', back: 'alice' });
  await room.update(releasePlan(game.captures, 'cara', game.users));
  assert.deepEqual(game.captures.alice, { leader: 'cara', via: 'alice' });
  // Duplicate delivery and a delayed event after Bob rejoins must preserve valid captures.
  await room.update({ 'users/bob': { real: 'Bob', clan: 'Bob' }, ...capturePlan(game.captures, 'bob', 'dan') });
  const rejoined = structuredClone(game);
  await h.exports.roomEmptied(h.snapshot(users.bob), { params: { gameId: 'room', userId: 'bob' } });
  assert.deepEqual(h.data.games.room, rejoined);
});

test('the deletion trigger frees a departed leader\'s followers and normalizes a missing current via', async () => {
  const h = harness({ games: { room: {
    state: 'waiting', locked: true,
    users: { alice: { real: 'Alice' }, cara: { real: 'Cara' }, eve: { real: 'Eve' } },
    captures: { alice: { leader: 'cara', via: 'bob', back: 'alice' }, eve: { leader: 'bob', via: 'eve' }, bob: { leader: 'cara', via: 'bob' } }
  } } });
  await h.exports.roomEmptied(h.snapshot({ real: 'Bob' }), { params: { gameId: 'room', userId: 'bob' } });
  assert.deepEqual(h.data.games.room.captures, { alice: { leader: 'cara', via: 'alice' } });
  await h.exports.roomEmptied(h.snapshot({ real: 'Bob' }), { params: { gameId: 'room', userId: 'bob' } });
  assert.deepEqual(h.data.games.room.captures, { alice: { leader: 'cara', via: 'alice' } });
});

test('a departure with valid captures avoids a whole-room transaction', async () => {
  let ref;
  let transactions = 0;
  const database = { ref: target => ref(target) };
  const h = harness({ games: { room: {
    state: 'waiting', locked: true, users: { alice: { real: 'Alice' }, cara: { real: 'Cara' } },
    captures: { alice: { leader: 'cara', via: 'alice' } }, voice: { 0: 'clip' }, replay: { count: 2 }
  } } }, {}, { database });
  ref = target => {
    const base = h.ref(target);
    return { ...base, transaction: callback => { transactions++; return base.transaction(callback); } };
  };
  const before = structuredClone(h.data.games.room);
  await h.exports.roomEmptied(h.snapshot({ real: 'Bob' }), { params: { gameId: 'room', userId: 'bob' } });
  assert.equal(transactions, 0);
  assert.deepEqual(h.data.games.room, before);
});

test('capture cleanup rechecks the roster after the preliminary reads', async () => {
  let ref;
  let transactions = 0;
  const database = { ref: target => ref(target) };
  const captures = { alice: { leader: 'cara', via: 'bob', back: 'alice' } };
  const h = harness({ games: { room: {
    state: 'waiting', locked: true, users: { alice: { real: 'Alice' }, cara: { real: 'Cara' } }, captures
  } } }, {}, { database });
  ref = target => {
    const base = h.ref(target);
    return { ...base, transaction: async callback => {
      transactions++;
      // A delayed deletion event races with Bob rejoining before the transaction.
      await base.update({ 'users/bob': { real: 'Bob' } });
      return base.transaction(callback);
    } };
  };
  await h.exports.roomEmptied(h.snapshot({ real: 'Bob' }), { params: { gameId: 'room', userId: 'bob' } });
  assert.equal(transactions, 1);
  assert.deepEqual(h.data.games.room.captures, captures);
  assert.equal(h.data.games.room.users.bob.real, 'Bob');
});

test('a room emptied after its reveal stays a full idle spell, however old it is', async () => {
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  const room = extra => ({
    state: 'waiting', locked: true, name: 'room', pass: 'ABCDEF', names: ['otter'],
    createdAt: now - 13 * hour, startedAt: now - 5 * 60 * 1000, ...extra
  });
  const h = harness({ games: { room: room() }, roomNames: { room: { ABCDEF: 'room' } } });
  // The last player leaves, taking their presence entry, and the server opens the next round.
  await h.exports.roomEmptied(h.snapshot({ real: 'Alice', clan: 'Alice' }), { params: { gameId: 'room', userId: 'alice' } });
  assert.equal(h.data.games.room.startedAt, undefined);
  await h.exports.dailySweep();
  assert.equal(h.data.games.room?.name, 'room');
  assert.equal(h.data.roomNames.room?.ABCDEF, 'room');

  // A room whose last activity is past the threshold still goes.
  const idle = harness({ games: { room: room({ startedAt: undefined, activeAt: now - 13 * hour }) }, roomNames: { room: { ABCDEF: 'room' } } });
  await idle.exports.dailySweep();
  assert.equal(idle.data.games.room, undefined);
  assert.equal(idle.data.roomNames.room?.ABCDEF, undefined);
});
