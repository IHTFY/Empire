const assert = require('node:assert/strict');
const { test } = require('node:test');

function element() {
  return { hidden: true, value: '', textContent: '', innerHTML: '', clientWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: { setProperty() {} }, addEventListener() {}, querySelector: () => element(),
    setAttribute() {}, replaceChildren() {}, closest: () => element() };
}

async function mount(t) {
  const fixedNow = Date.now();
  t.mock.method(Date, 'now', () => fixedNow);
  const elements = new Map();
  global.document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    addEventListener() {}, querySelectorAll: () => [], createElement: () => element() };
  global.ResizeObserver = class { observe() {} };
  global.localStorage = { getItem: key => key === 'reverb' ? 'off' : null };
  const decoding = Promise.withResolvers();
  const beganDecoding = Promise.withResolvers();
  const sources = [];
  const spoken = [];
  let voiceCancels = 0;
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  global.speechSynthesis = { cancel() { voiceCancels++; }, speak(utterance) { spoken.push(utterance.text); } };
  const node = () => ({ gain: {}, connect() { return this; } });
  global.window = { speechSynthesis: global.speechSynthesis, AudioContext: class {
    state = 'running'; destination = {};
    decodeAudioData() { beganDecoding.resolve(); return decoding.promise; }
    createBufferSource() {
      const source = { ...node(), starts: 0, stops: 0,
        start() { this.starts++; }, stop() { this.stops++; } };
      sources.push(source);
      return source;
    }
    createGain() { return node(); }
  } };
  const room = { id: 'A', state: 'playing', users: { me: { real: 'Alice' } } };
  const data = { 'games/A/names': ['apple', 'pear'], 'games/A/startedAt': Date.now() - 3100,
    'games/A/voice': { 0: 'YQ==' } };
  const db = { ref(path) { return {
    once: async () => ({ val: () => data[path] ?? null }),
    on(_type, callback) { callback({ val: () => data[path] ?? 0 }); }, off() {}, set: async () => {}
  }; } };
  const { createAudio } = await import('../public/audio.js');
  const { createReveal } = await import('../public/reveal.js');
  const audio = createAudio({ db, rollNumber() {} });
  const reveal = createReveal({ db, flashNames: async () => {}, getRoom: () => room,
    getUid: () => 'me', audio, ui: { toast() {} }, refreshLobby() {} });
  return { audio, reveal, room, decoding, beganDecoding, sources, spoken, voiceCancels: () => voiceCancels };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const failsDecoding of [false, true]) {
  test(`canceling a reveal prevents delayed ${failsDecoding ? 'device voice fallback' : 'recorded playback'} after leaving`, async t => {
    const m = await mount(t);
    const playback = m.reveal.play();
    await m.beganDecoding.promise;
    // Allow the reveal loop to call speak() while decodeAudioData is unresolved.
    await flush();
    m.room.id = null;
    m.room.state = null;
    m.reveal.cancel();
    await playback;
    assert.equal(m.reveal.isRevealing(), false);
    if (failsDecoding) m.decoding.reject(new Error('Invalid recording'));
    else m.decoding.resolve({ duration: 1 });
    await flush();
    assert.equal(m.sources.reduce((sum, source) => sum + source.starts, 0), 0,
      'Canceled reveal started its old recording after the room had been left');
    assert.deepEqual(m.spoken, []);
  });
}

for (const playing of [false, true]) {
  test(`leaving the room stops a bot announcement whose recording is ${playing ? 'playing' : 'still decoding'}`, async t => {
    const m = await mount(t);
    if (playing) m.decoding.resolve({ duration: 1 });
    m.reveal.observeEliminated({ val: () => ({ bot1: { name: 'apple', at: Date.now(), voice: 'YQ==' } }) });
    await m.beganDecoding.promise;
    await flush();
    assert.equal(m.sources.length, playing ? 1 : 0);
    // Leaving the room cancels the announcements (see onDetach in public/script.js).
    m.room.id = null;
    m.reveal.cancelAnnouncements();
    m.decoding.resolve({ duration: 1 });
    await flush();
    assert.deepEqual(m.sources.map(source => [source.starts, source.stops]), playing ? [[1, 1]] : [],
      'The announcement kept speaking after the room had been left');
    assert.deepEqual(m.spoken, []);
  });
}

test('clearing clips stops active recordings and device speech', async t => {
  const m = await mount(t);
  m.decoding.resolve({ duration: 1 });
  await m.audio.speak('apple', 'YQ==');
  await m.audio.speak('pear', 'Yg==');
  await m.audio.speak('plum');
  assert.deepEqual(m.sources.map(source => source.starts), [1, 1]);
  assert.deepEqual(m.spoken, ['plum']);
  const voiceCancels = m.voiceCancels();
  m.audio.clearClips();
  assert.deepEqual(m.sources.map(source => source.stops), [1, 1]);
  assert.equal(m.voiceCancels(), voiceCancels + 1);
  m.audio.clearClips();
  assert.deepEqual(m.sources.map(source => source.stops), [1, 1]);
});

test('finished recordings are released before clearing clips', async t => {
  const m = await mount(t);
  m.decoding.resolve({ duration: 1 });
  await m.audio.speak('apple', 'YQ==');
  m.sources[0].onended();
  m.audio.clearClips();
  assert.equal(m.sources[0].stops, 0);
});

test('new speech can play while an older canceled decode finishes', async t => {
  const m = await mount(t);
  const oldSpeech = m.audio.speak('apple', 'YQ==');
  m.audio.clearClips();
  const newSpeech = m.audio.speak('pear', 'Yg==');
  m.decoding.resolve({ duration: 1 });
  await Promise.all([oldSpeech, newSpeech]);
  assert.deepEqual(m.sources.map(source => source.starts), [1]);
  assert.deepEqual(m.spoken, []);
});

test('a decode failure still uses device speech when it has not been canceled', async t => {
  const m = await mount(t);
  const speech = m.audio.speak('apple', 'YQ==');
  m.decoding.reject(new Error('Invalid recording'));
  await speech;
  assert.deepEqual(m.spoken, ['apple']);
  assert.deepEqual(m.sources, []);
});
