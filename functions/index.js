// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions/v1');
const { createHash } = require('node:crypto');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');

// Uses the Cloud Functions runtime's default service account credentials. A named app keeps
// this connection separate from the one the functions framework opens for database triggers.
const app = initializeApp({
  databaseURL: 'https://empire-ihtfy.firebaseio.com'
}, 'empire');

const db = getDatabase(app);


function shuffle(a) {
  for (let i = 0; i < a.length - 1; i++) {
    let j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// gcloud alpha functions add-iam-policy-binding flashNames --member=allUsers --role=roles/cloudfunctions.invoker
// https://github.com/firebase/functions-samples/issues/395#issuecomment-605025572
exports.flashNames = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to start a game.');
  }

  const gameID = data && data.text;
  if (typeof gameID !== 'string' || !/^[^./#$[\]]{1,128}$/.test(gameID)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid game code.');
  }

  // Only players in the room can start it.
  const member = await db.ref(`games/${gameID}/users/${context.auth.uid}`).once('value');
  if (!member.exists()) {
    throw new functions.https.HttpsError('permission-denied', 'You are not in this game.');
  }

  const gameRef = db.ref(`games/${gameID}`);
  const game = (await gameRef.once('value')).val() || {};
  const users = game.users || {};
  const secrets = game.secrets || {};

  // After the first reveal the room is locked and keeps the same order, so reading the
  // names again replays them exactly (players can memorize by position).
  let names = game.locked && Array.isArray(game.names) ? game.names : null;
  if (!names) {
    // Secret names live in /secrets; rooms from before that change kept them on the player.
    names = Object.keys(users)
      .map(key => secrets[key] || users[key].fake)
      .filter(name => typeof name === 'string' && name.length > 0);
    if (names.length < 2) {
      throw new functions.https.HttpsError('failed-precondition', 'You need at least 2 players to start.');
    }
    names = shuffle(names);
  }

  // A reveal takes 2.5s per name; if nobody finished it (everyone left mid-reveal),
  // let the room be started again instead of staying stuck.
  const previousNames = Array.isArray(game.names) ? game.names.length : 0;
  const stale = ['shuffling', 'playing'].includes(game.state) &&
    !(Date.now() - (game.startedAt || 0) < previousNames * 2500 + 30000);

  // Claim the start atomically so two players pressing Start at once only start one reveal.
  const claim = await gameRef.child('state').transaction(current => {
    // The first pass can run on an empty local cache; the server then retries with the real value.
    if (current === null) {
      return null;
    }
    if (current === 'waiting' || (stale && current === game.state)) {
      return 'shuffling';
    }
    return undefined;
  });
  if (!claim.committed) {
    return true;
  }

  await gameRef.update({
    names: names,
    startedAt: ServerValue.TIMESTAMP,
    locked: true,
    state: 'playing'
  });

  // Record each name in a natural voice while the 3-2-1 countdown runs. Every device plays
  // the same clip; players fall back to their device's voice for any clip that isn't there.
  if (!(game.locked && game.voice)) {
    await recordNames(gameRef, names);
  }
  return true;
});

// Google Cloud Text-to-Speech (Chirp 3 HD voices), called over REST with the function's
// own service account so it needs no extra package.
//
// It must stay free: Google's free tier covers 1M characters a month, so recording stops
// at FREE_CHARS a month (players then hear their device's voice), and every recorded word
// is cached so the same word is never paid for twice.
const VOICE = { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' };
const FREE_CHARS = 900000;

async function synthesize(text) {
  const { access_token: token } = await applicationDefault().getAccessToken();
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: VOICE, audioConfig: { audioEncoding: 'MP3' } }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    throw new Error(`Text-to-Speech ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return (await response.json()).audioContent;
}

// Reserve characters from this month's free allowance; false once it would run over.
async function reserve(chars) {
  const month = new Date().toISOString().slice(0, 7);
  const result = await db.ref(`meta/tts/${month}`).transaction(used => {
    if ((used || 0) + chars > FREE_CHARS) return undefined;
    return (used || 0) + chars;
  });
  return result.committed;
}

// A recording of `text`, from the cache or newly made; null when the free allowance is used up.
async function recording(text) {
  const key = createHash('sha256').update(`${VOICE.name}|${text}`).digest('hex').slice(0, 40);
  const cached = db.ref(`meta/voiceCache/${key}`);
  const used = db.ref(`meta/voiceUsed/${key}`);
  const hit = (await cached.once('value')).val();
  if (hit) {
    await used.set(Date.now());
    return hit;
  }
  if (!(await reserve(text.length))) return null;
  const audio = await synthesize(text);
  await Promise.all([cached.set(audio), used.set(Date.now())]);
  return audio;
}

async function recordNames(gameRef, names) {
  const once = new Map(); // a word used twice in one game is recorded once
  const jobs = names.map(async (name, i) => {
    if (!once.has(name)) once.set(name, recording(name));
    const audio = await once.get(name);
    if (audio) await gameRef.child(`voice/${i}`).set(audio);
  });
  jobs.push((async () => {
    const sample = db.ref('voiceSample');
    if ((await sample.once('value')).exists()) return;
    const audio = await recording('Empire');
    if (audio) await sample.set(audio);
  })());
  const results = await Promise.allSettled(jobs);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    functions.logger.warn(`Voice: ${failed.length} of ${results.length} clips failed`, failed[0].reason && failed[0].reason.message);
  }
}

const IDLE_MS = 12 * 60 * 60 * 1000;
const VOICE_KEEP_MS = 60 * 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 30 * 60 * 1000;

// Room lifecycle: a new round unlocks the room and forgets the old order; creating a
// room also sweeps away rooms nobody has been connected to for 12 hours.
exports.roomState = functions.database.instance('empire-ihtfy').ref('/games/{gameId}/state').onWrite(async (change, context) => {
  const before = change.before.val();
  const after = change.after.val();
  if (after === 'resetting' && before !== 'resetting') {
    await db.ref(`games/${context.params.gameId}`).update({ names: null, startedAt: null, locked: null, voice: null });
  }
  if (!change.before.exists() && change.after.exists()) {
    await sweepAbandonedRooms(context.params.gameId);
  }
  return null;
});

async function sweepAbandonedRooms(skipId) {
  const now = Date.now();
  const claim = await db.ref('meta/lastSweep').transaction(last => (last && now - last < SWEEP_EVERY_MS ? undefined : now));
  if (!claim.committed) {
    return;
  }
  const [gamesSnap, seenSnap, voiceSnap] = await Promise.all([
    db.ref('games').once('value'), db.ref('meta/seen').once('value'), db.ref('meta/voiceUsed').once('value')
  ]);
  const games = gamesSnap.val() || {};
  const seen = seenSnap.val() || {};
  const updates = {};

  // Recordings nobody has needed for 60 days are dropped so the cache stays small.
  Object.entries(voiceSnap.val() || {}).forEach(([key, last]) => {
    if (now - last > VOICE_KEEP_MS) {
      updates[`meta/voiceCache/${key}`] = null;
      updates[`meta/voiceUsed/${key}`] = null;
    }
  });

  Object.entries(games).forEach(([id, game]) => {
    if (id === skipId || !game) {
      return;
    }
    const presence = Object.values(game.presence || {}).filter(Boolean);
    if (presence.some(p => p.online)) {
      if (seen[id]) updates[`meta/seen/${id}`] = null;
      return;
    }
    const times = presence.map(p => p.lastSeen).concat([game.startedAt, game.createdAt, seen[id]])
      .filter(t => typeof t === 'number');
    if (times.length === 0) {
      // No sign of activity yet (a room from before presence tracking): start its clock now.
      updates[`meta/seen/${id}`] = now;
    } else if (now - Math.max(...times) > IDLE_MS) {
      updates[`games/${id}`] = null;
      updates[`meta/seen/${id}`] = null;
    }
  });
  Object.keys(seen).forEach(id => {
    if (!games[id]) updates[`meta/seen/${id}`] = null;
  });

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }
}
