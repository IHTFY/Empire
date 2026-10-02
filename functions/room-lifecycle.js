const { db } = require('./firebase');
const { VOICE, VOICE_DIR } = require('./voice');

const IDLE_MS = 12 * 60 * 60 * 1000;
const VOICE_KEEP_MS = 60 * 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 30 * 60 * 1000;

// Room lifecycle: a new round unlocks the room and forgets the old order; creating a
// room also sweeps away rooms nobody has been connected to for 12 hours.
async function roomState(change, context) {
  const before = change.before.val();
  const after = change.after.val();
  if (after === 'resetting' && before !== 'resetting') {
    // Clients cannot return to waiting after their membership is cleared. Finish the reset
    // here, and ignore a delayed trigger if the room has already moved on.
    const room = db.ref(`games/${context.params.gameId}`);
    await room.once('value');
    await room.transaction(game => {
      // Ask the server to retry an empty local cache before checking the room state.
      if (game === null) return null;
      if (!game || game.state !== 'resetting') return undefined;
      for (const key of ['users', 'secrets', 'names', 'startedAt', 'revealEndsAt', 'roundId', 'revealId', 'nameOwners', 'replay', 'locked', 'voice', 'eliminated', 'captures', 'claims']) delete game[key];
      game.state = 'waiting';
      return game;
    });
  }
  if (!change.before.exists() && change.after.exists()) {
    await sweepAbandonedRooms(context.params.gameId);
  }
  return null;
}

// Creating a room is what normally triggers the sweep, so quiet spells would leave abandoned
// rooms (and bot-only ones) around indefinitely. This runs it once a day regardless.
async function dailySweep() {
  await sweepAbandonedRooms(null);
  return null;
}

async function sweepAbandonedRooms(skipId) {
  const now = Date.now();
  const claim = await db.ref('meta/lastSweep').transaction(last => (last && now - last < SWEEP_EVERY_MS ? undefined : now));
  if (!claim.committed) {
    return;
  }
  // Names are read before rooms: a room is created together with its name, so every name
  // read here has its room in the later read unless the room is really gone.
  const roomNames = (await db.ref('roomNames').once('value')).val() || {};
  const [gamesSnap, seenSnap, voiceSnap, voiceNameSnap] = await Promise.all([
    db.ref('games').once('value'), db.ref('meta/seen').once('value'),
    db.ref(`${VOICE_DIR}/used`).once('value'), db.ref('meta/voiceName').once('value')
  ]);
  const games = gamesSnap.val() || {};
  const seen = seenSnap.val() || {};
  const updates = {};

  // Only the current voice is kept: after a voice change, the previous voice's recordings
  // are deleted, along with the shared store used before recordings were kept per voice.
  const previousVoice = voiceNameSnap.val();
  if (previousVoice !== VOICE.name) {
    if (previousVoice) updates[`meta/voice/${previousVoice}`] = null;
    updates['meta/voiceCache'] = null;
    updates['meta/voiceUsed'] = null;
    updates['meta/voiceName'] = VOICE.name;
  }

  // Recordings nobody has needed for 60 days are dropped so the cache stays small.
  Object.entries(voiceSnap.val() || {}).forEach(([key, last]) => {
    if (now - last > VOICE_KEEP_MS) {
      updates[`${VOICE_DIR}/cache/${key}`] = null;
      updates[`${VOICE_DIR}/used/${key}`] = null;
    }
  });

  const candidates = [];
  Object.entries(games).forEach(([id, game]) => {
    if (id === skipId || !game) {
      return;
    }
    const status = activityStatus(game, seen[id], now);
    if (status === 'live') {
      if (seen[id]) updates[`meta/seen/${id}`] = null;
    } else if (status === 'unknown') {
      // No sign of activity yet (a room from before presence tracking): start its clock now.
      updates[`meta/seen/${id}`] = now;
    } else if (status === 'idle') {
      candidates.push({ id, name: game.name, pass: game.pass });
    }
  });
  // Names whose room has gone some other way.
  Object.entries(roomNames).forEach(([name, passes]) => {
    Object.entries(passes || {}).forEach(([pass, id]) => {
      if (!games[id]) updates[`roomNames/${name}/${pass}`] = null;
    });
  });
  Object.keys(seen).forEach(id => {
    if (!games[id]) updates[`meta/seen/${id}`] = null;
  });

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }
  await Promise.all(candidates.map(candidate => deleteIfStillIdle(candidate, seen[candidate.id], now)));
}

// 'live' (someone is connected), 'unknown' (no timestamps yet), 'idle' (past the threshold)
// or 'recent'.
function activityStatus(game, seenAt, now) {
  const presence = Object.values(game.presence || {}).filter(Boolean);
  if (presence.some(p => p.version === 2 ? Object.keys(p.connections || {}).length > 0 : p.online)) {
    return 'live';
  }
  const times = presence.map(p => p.lastSeen).concat([game.startedAt, game.createdAt, seenAt])
    .filter(t => typeof t === 'number');
  if (times.length === 0) return 'unknown';
  return now - Math.max(...times) > IDLE_MS ? 'idle' : 'recent';
}

// The sweep's snapshot can be stale by the time it deletes: a player may have reconnected
// since. Recheck the room's current state inside the transaction that removes it, and free
// its name only if that deletion happened and the name still points at this room.
async function deleteIfStillIdle({ id, name, pass }, seenAt, now) {
  let deleted = false;
  await db.ref(`games/${id}`).transaction(game => {
    deleted = false;
    // An empty local cache is retried against the server; a missing room needs no change.
    if (!game) return game;
    if (activityStatus(game, seenAt, now) !== 'idle') return undefined;
    deleted = true;
    return null;
  });
  if (!deleted) return;
  await db.ref(`meta/seen/${id}`).set(null);
  if (name && pass) {
    await db.ref(`roomNames/${name}/${pass}`).transaction(current => (current === id ? null : undefined));
  }
}

module.exports = { roomState, dailySweep, sweepAbandonedRooms };
