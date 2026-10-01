const { randomUUID } = require('node:crypto');
const { db, functions, ServerValue } = require('./firebase');
const { recording, recordNames } = require('./voice');
const { updateReveal } = require('./reveal-state');

function shuffle(a) {
  for (let i = 0; i < a.length - 1; i++) {
    let j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Keep the first reveal as the canonical list. Playback indexes preserve voice alignment
// and relative order, even when two players chose the same secret. Owners stay server-only.
function indexesForReread(game) {
  const retired = new Map();
  Object.values(game.eliminated || {}).forEach(entry => {
    if (typeof entry?.name === 'string') retired.set(entry.name, (retired.get(entry.name) || 0) + 1);
  });
  return game.names.map((name, i) => i).filter(i => {
    if (Array.isArray(game.nameOwners)) return !game.eliminated?.[game.nameOwners[i]];
    // Rooms revealed before ownership was recorded use one occurrence per announcement.
    const name = game.names[i];
    const count = retired.get(name) || 0;
    if (count) { retired.set(name, count - 1); return false; }
    return true;
  });
}

// gcloud alpha functions add-iam-policy-binding flashNames --member=allUsers --role=roles/cloudfunctions.invoker
// https://github.com/firebase/functions-samples/issues/395#issuecomment-605025572
async function flashNames(data, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to start a game.');
  }

  const gameID = data && data.text;
  if (typeof gameID !== 'string' || !/^[^./#$[\]]{1,128}$/.test(gameID)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid game code.');
  }

  const gameRef = db.ref(`games/${gameID}`);
  // Reject outsiders before attempting a start; membership is checked again on every retry.
  const initial = (await gameRef.once('value')).val();
  if (!initial?.users?.[context.auth.uid]) {
    throw new functions.https.HttpsError('permission-denied', 'You are not in this game.');
  }
  const revealId = randomUUID();
  const newRoundId = randomUUID();
  let failure = null;
  let reuseVoice = false;
  const claim = await gameRef.transaction(game => {
    // An empty local cache must reach the server before deciding that the room is gone.
    if (game === null) return null;
    if (!game?.users?.[context.auth.uid]) {
      failure = new functions.https.HttpsError('permission-denied', 'You are not in this game.');
      return undefined;
    }
    const length = Array.isArray(game.names) ? game.names.length : 0;
    const stale = ['shuffling', 'playing'].includes(game.state) &&
      Date.now() - (game.startedAt || 0) >= length * 2500 + 33000;
    if (game.state !== 'waiting' && !stale) return undefined;
    let names = game.locked && Array.isArray(game.names) ? game.names : null;
    reuseVoice = Boolean(names && game.voice);
    if (!names) {
      const entries = Object.keys(game.users)
        .map(key => ({ key, name: game.secrets?.[key] || game.users[key].fake }))
        .filter(entry => typeof entry.name === 'string' && entry.name.length > 0);
      if (entries.length < 2) {
        failure = new functions.https.HttpsError('failed-precondition', 'You need at least 2 players to start.');
        return undefined;
      }
      shuffle(entries);
      names = entries.map(entry => entry.name);
      game.nameOwners = entries.map(entry => entry.key);
      delete game.voice;
    }
    // Freeze names and lock submissions in the same transaction that claims the start.
    return { ...game, names, locked: true, state: 'shuffling', startedAt: ServerValue.TIMESTAMP,
      roundId: game.roundId || newRoundId, revealId };
  });
  if (claim.committed && !claim.snapshot.exists()) {
    throw new functions.https.HttpsError('permission-denied', 'You are not in this game.');
  }
  if (!claim.committed) {
    if (failure) throw failure;
    return true;
  }
  const names = claim.snapshot.val().names;
  const voice = reuseVoice ? null : recordNames(gameRef, names, revealId);
  const ready = voice ? await voice.ready : {};
  await updateReveal(gameRef, revealId, game => {
    if (game.state !== 'shuffling') return undefined;
    game.state = 'playing';
    game.startedAt = ServerValue.TIMESTAMP;
    const indexes = indexesForReread(game);
    game.replay = { indexes, count: indexes.length };
    game.revealEndsAt = Date.now() + 3000 + indexes.length * 2500;
    game.voice = { ...game.voice, ...ready };
    return game;
  });
  if (voice) await voice.done;
  return true;
}

// A bot removed after the names were revealed: publish its secret name (and recording) so
// every device shows and speaks it. Players flag the removal in /eliminated; only that flag
// makes this a bot, so a player leaving the room never gives away their own secret.
async function revealRemoved(snapshot, context) {
  const name = snapshot.val();
  const { gameId, userId } = context.params;
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  const gameRef = db.ref(`games/${gameId}`);
  const game = (await gameRef.once('value')).val() || {};
  if (!game.locked || !Array.isArray(game.names) || !game.names.includes(name) || game.eliminated?.[userId] !== true) {
    return null;
  }
  const audio = await recording(name).catch(() => null);
  const entry = { name, at: ServerValue.TIMESTAMP };
  if (audio) entry.voice = audio;
  await gameRef.transaction(current => {
    if (current === null) return null;
    if (!current?.locked || current.roundId !== game.roundId || current.eliminated?.[userId] !== true || ['resetting', 'deleting'].includes(current.state)) return undefined;
    current.eliminated[userId] = entry;
    return current;
  });
  return null;
}

module.exports = { flashNames, revealRemoved, indexesForReread };
