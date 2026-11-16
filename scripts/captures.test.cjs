const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('../functions/test/support/functions.cjs');

const users = keys => Object.fromEntries(keys.map(key => [key, { real: key, clan: key }]));

test('a leader who leaves frees their followers in the data, not only on screen', async () => {
  const { departurePlan } = await import('../public/captures.js');
  const captures = { fay: { leader: 'lea', via: 'fay' }, gus: { leader: 'lea', via: 'fay', back: 'gus' }, yan: { leader: 'zed', via: 'yan' } };
  assert.deepEqual(departurePlan(captures, 'lea'), { 'captures/fay': null, 'captures/gus': null });
  // A captured player who leaves takes only their own record.
  assert.deepEqual(departurePlan(captures, 'yan'), { 'captures/yan': null });
  assert.deepEqual(departurePlan(captures, 'zed'), { 'captures/yan': null });
});

test('a capture or claim clears the records of its players that the lobby already ignores', async () => {
  const { staleCaptures } = await import('../public/captures.js');
  const captures = {
    fay: { leader: 'lea', via: 'fay' }, // Lea left on an older page
    yan: { leader: 'kim', via: 'yan' }, // Kim was captured into Zed at the same moment
    kim: { leader: 'zed', via: 'kim' },
    ola: { leader: 'zed', via: 'ola' }
  };
  const room = users(['fay', 'yan', 'kim', 'ola', 'zed']);
  assert.deepEqual(staleCaptures(captures, room, ['fay', 'yan']), { 'captures/fay': null, 'captures/yan': null });
  // Live records and players outside the write are left alone.
  assert.deepEqual(staleCaptures(captures, room, ['kim', 'ola', 'zed']), {});
});

async function mergedEmpire(lastLeader) {
  const helpers = await import('../public/captures.js');
  const users = Object.fromEntries(['alice', 'bob', 'cara', 'dan'].map(id => [id, { real: id, clan: id }]));
  const h = harness({ games: { room: { state: 'waiting', locked: true, users } } });
  const room = h.ref('games/room');
  await room.update(helpers.capturePlan({}, 'alice', 'bob'));
  await room.update(helpers.capturePlan(h.data.games.room.captures, 'bob', 'cara'));
  if (lastLeader === 'dan') await room.update(helpers.capturePlan(h.data.games.room.captures, 'cara', 'dan'));
  const known = structuredClone(h.data.games.room.captures);
  await helpers.writeLeave(room, known, 'bob', { 'users/bob': null, 'secrets/bob': null, 'presence/bob': null });
  return { game: h.data.games.room, helpers };
}

test('a captured intermediary leaving preserves an Undo action for remaining captives', async () => {
  const { game, helpers } = await mergedEmpire('cara');
  assert.equal(game.users.bob, undefined);
  assert.equal(game.captures.alice.leader, 'cara');
  const undoButtons = Object.keys(game.users).filter(id => game.captures[id]?.via === id);
  const releasable = undoButtons.flatMap(id => Object.keys(helpers.releasePlan(game.captures, id)));
  assert.ok(releasable.includes('captures/alice'),
    `Alice has no Undo action: ${JSON.stringify({ captures: game.captures, undoButtons })}`);
});

test('undoing an outer capture after an intermediary leaves keeps every restored via valid', async () => {
  const { game, helpers } = await mergedEmpire('dan');
  assert.equal(game.captures.cara.via, 'cara');
  const update = helpers.releasePlan(game.captures, 'cara');
  const missing = Object.entries(update).filter(([, capture]) => capture && !game.users[capture.via]);
  assert.deepEqual(missing, [],
    `Undo restores departed vias, which database.rules.json rejects: ${JSON.stringify(missing)}`);
});

test('removing an intermediary preserves separate inner empires through successive undos', async () => {
  const { capturePlan, releasePlan, writeRemoval } = await import('../public/captures.js');
  const h = harness({ games: { room: { users: users(['alice', 'bob', 'cara', 'dan', 'eve', 'fay']) } } });
  const room = h.ref('games/room');
  const capture = (key, leader) => room.update(capturePlan(h.data.games.room.captures || {}, key, leader));
  await capture('eve', 'alice');
  await capture('alice', 'bob');
  await capture('fay', 'bob');
  await capture('bob', 'cara');
  await capture('cara', 'dan');
  await writeRemoval(room, structuredClone(h.data.games.room.captures), 'bob', { 'users/bob': null });
  const game = h.data.games.room;
  assert.deepEqual(game.captures.eve, { leader: 'dan', via: 'cara', back: 'alice/eve' });
  await room.update(releasePlan(game.captures, 'cara', game.users));
  assert.deepEqual(game.captures, {
    eve: { leader: 'cara', via: 'alice', back: 'eve' },
    alice: { leader: 'cara', via: 'alice' },
    fay: { leader: 'cara', via: 'fay' }
  });
  await room.update(releasePlan(game.captures, 'alice', game.users));
  assert.deepEqual(game.captures, { eve: { leader: 'alice', via: 'eve' }, fay: { leader: 'cara', via: 'fay' } });
  await room.update(releasePlan(game.captures, 'eve', game.users));
  await room.update(releasePlan(game.captures, 'fay', game.users));
  assert.deepEqual(game.captures, {});
});

test('departure transactions normalize the latest history without overwriting a newer empire', async () => {
  const { writeLeave } = await import('../public/captures.js');
  const known = {
    alice: { leader: 'cara', via: 'bob', back: 'alice' },
    eve: { leader: 'cara', via: 'bob', back: 'eve' }
  };
  const latest = {
    alice: { leader: 'dan', via: 'cara', back: 'bob/alice' },
    eve: { leader: 'dan', via: 'eve' }
  };
  const h = harness({ games: { room: { users: users(['alice', 'bob', 'cara', 'dan', 'eve']), captures: latest } } });
  await writeLeave(h.ref('games/room'), known, 'bob', { 'users/bob': null });
  assert.deepEqual(h.data.games.room.captures, {
    alice: { leader: 'dan', via: 'cara', back: 'alice' },
    eve: { leader: 'dan', via: 'eve' }
  });
});

test('Undo skips departed history in older rooms and handles a departed release target', async () => {
  const { releasePlan } = await import('../public/captures.js');
  const captures = {
    alice: { leader: 'dan', via: 'cara', back: 'bob/alice' },
    cara: { leader: 'dan', via: 'cara' },
    eve: { leader: 'dan', via: 'cara', back: 'bob' }
  };
  assert.deepEqual(releasePlan(captures, 'cara', users(['alice', 'cara', 'dan', 'eve'])), {
    'captures/alice': { leader: 'cara', via: 'alice' },
    'captures/cara': null,
    'captures/eve': { leader: 'cara', via: 'eve' }
  });
  assert.deepEqual(releasePlan(captures, 'cara', users(['alice', 'dan', 'eve'])), {
    'captures/alice': null,
    'captures/cara': null,
    'captures/eve': null
  });
});

test('legacy captures without history keep an Undo action after their intermediary leaves', async () => {
  const { departurePlan } = await import('../public/captures.js');
  assert.deepEqual(departurePlan({ alice: { leader: 'cara', via: 'bob' } }, 'bob'), {
    'captures/alice': { leader: 'cara', via: 'alice' }
  });
});
