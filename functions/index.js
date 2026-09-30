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
  // Marks when this start began, so a second press while the voices load isn't taken as stale.
  await gameRef.child('startedAt').set(ServerValue.TIMESTAMP);

  // Record every name before the countdown so each one plays in the recorded voice. Players
  // wait (the Start button shows "Getting voices ready") until the clips are in, up to
  // VOICE_WAIT_MS; a name still missing then falls back to the device's voice.
  const voice = game.locked && game.voice ? null : recordNames(gameRef, names);
  const ready = voice ? await voice.ready : {};
  const start = { names: names, startedAt: ServerValue.TIMESTAMP, locked: true, state: 'playing' };
  Object.entries(ready).forEach(([i, audio]) => { start[`voice/${i}`] = audio; });
  await gameRef.update(start);
  if (voice) await voice.done;
  return true;
});

// Google Cloud Text-to-Speech (Chirp 3 HD voices), called over REST with the function's
// own service account so it needs no extra package.
//
// It must stay free: Google's free tier covers 1M characters a month, so recording stops
// at FREE_CHARS a month (players then hear their device's voice), and every recorded word
// is cached so the same word is never paid for twice.
const VOICE = { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Enceladus' };
// Recordings are kept per voice, so changing VOICE never serves or keeps the old voice.
const VOICE_DIR = `meta/voice/${VOICE.name}`;
const VOICE_WAIT_MS = 12000;
const VOICE_JOBS = 4; // recordings made at once, so a big room doesn't hit Google's rate limit
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
  const cached = db.ref(`${VOICE_DIR}/cache/${key}`);
  const used = db.ref(`${VOICE_DIR}/used/${key}`);
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

// Records the names in reveal order, a few at a time. `ready` resolves with the clips made
// within VOICE_WAIT_MS (by reveal index); any clip made later goes straight to the room, and
// `done` resolves once every recording has finished.
function recordNames(gameRef, names) {
  const clips = {};
  let late = false;
  // At most VOICE_JOBS recordings at once; slots are handed out in reveal order.
  let running = 0;
  const waiting = [];
  const slot = () => new Promise(resolve => {
    if (running < VOICE_JOBS) {
      running++;
      resolve();
    } else {
      waiting.push(resolve);
    }
  });
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };
  const made = new Map(); // a word used twice in one game is recorded once
  const jobs = names.map(async (name, i) => {
    if (!made.has(name)) made.set(name, slot().then(() => recording(name)).finally(release));
    const audio = await made.get(name);
    if (!audio) return;
    if (late) await gameRef.child(`voice/${i}`).set(audio);
    else clips[i] = audio;
  });
  jobs.push(recordSample());
  const done = Promise.allSettled(jobs).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      functions.logger.warn(`Voice: ${failed.length} of ${results.length} clips failed`, failed[0].reason && failed[0].reason.message);
    }
    return failed.length;
  });
  const ready = Promise.race([done, new Promise(resolve => setTimeout(resolve, VOICE_WAIT_MS))]).then(() => {
    late = true;
    return { ...clips };
  });
  return { ready, done };
}

// "Empire" in the current voice, for the voice volume slider. Kept at /voiceSample for good
// (the 60-day cleanup only touches the name cache) and made once per voice.
async function recordSample() {
  const marker = db.ref('meta/voiceSampleVoice');
  if ((await marker.once('value')).val() === VOICE.name) return;
  const audio = await recording('Empire');
  if (audio) await Promise.all([db.ref('voiceSample').set(audio), marker.set(VOICE.name)]);
}

// Record a secret name as soon as a player sets it, while the room is still waiting, so the
// recording is usually ready (cached) by the time someone presses Start.
exports.prepareVoice = functions.database.instance('empire-ihtfy').ref('/games/{gameId}/secrets/{userId}').onWrite(async change => {
  const name = change.after.val();
  if (typeof name !== 'string' || name.length === 0 || name === change.before.val()) {
    return null;
  }
  const results = await Promise.allSettled([recording(name), recordSample()]);
  const failed = results.find(r => r.status === 'rejected');
  if (failed) {
    functions.logger.warn('Voice: could not record in advance', failed.reason && failed.reason.message);
  }
  return null;
});

// A bot removed after the names were revealed: publish its secret name (and recording) so
// every device shows and speaks it. Players flag the removal in /eliminated; only that flag
// makes this a bot, so a player leaving the room never gives away their own secret.
exports.revealRemoved = functions.database.instance('empire-ihtfy').ref('/games/{gameId}/secrets/{userId}').onDelete(async (snapshot, context) => {
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
  await gameRef.child(`eliminated/${userId}`).set(entry);
  return null;
});

const IDLE_MS = 12 * 60 * 60 * 1000;
const VOICE_KEEP_MS = 60 * 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 30 * 60 * 1000;

// Room lifecycle: a new round unlocks the room and forgets the old order; creating a
// room also sweeps away rooms nobody has been connected to for 12 hours.
exports.roomState = functions.database.instance('empire-ihtfy').ref('/games/{gameId}/state').onWrite(async (change, context) => {
  const before = change.before.val();
  const after = change.after.val();
  if (after === 'resetting' && before !== 'resetting') {
    await db.ref(`games/${context.params.gameId}`).update({ names: null, startedAt: null, locked: null, voice: null, eliminated: null });
  }
  if (!change.before.exists() && change.after.exists()) {
    await sweepAbandonedRooms(context.params.gameId);
  }
  return null;
});

// Creating a room is what normally triggers the sweep, so quiet spells would leave abandoned
// rooms (and bot-only ones) around indefinitely. This runs it once a day regardless.
exports.dailySweep = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  await sweepAbandonedRooms(null);
  return null;
});

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
      // Free the room's name along with it.
      if (game.name && game.pass) updates[`roomNames/${game.name}/${game.pass}`] = null;
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
}
