const { createHash } = require('node:crypto');
const { db, functions, emulated, applicationDefault } = require('./firebase');
const { updateReveal } = require('./reveal-state');

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
  // Local games exercise the device-voice fallback without external TTS or credentials.
  if (emulated) return null;
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
function recordNames(gameRef, names, revealId) {
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
    if (late) {
      await updateReveal(gameRef, revealId, game => {
        game.voice = { ...game.voice, [i]: audio };
        return game;
      });
    } else clips[i] = audio;
  });
  jobs.push(recordSample());
  const done = Promise.allSettled(jobs).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      functions.logger.warn(`Voice: ${failed.length} of ${results.length} clips failed`, failed[0].reason && failed[0].reason.message);
    }
    return failed.length;
  });
  let timer;
  const ready = Promise.race([done, new Promise(resolve => { timer = setTimeout(resolve, VOICE_WAIT_MS); })]).then(() => {
    clearTimeout(timer);
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
async function prepareVoice(change) {
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
}

module.exports = { VOICE, VOICE_DIR, recording, recordNames, recordSample, prepareVoice };
