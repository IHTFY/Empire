import { $ } from './dom.js';

// Owns device sound settings, audio resources, and decoded clip lifetime.
export function createAudio({ db, rollNumber }) {
  // Sound: two volumes (0-100) kept per device. Effects are the join chime and countdown
  // ticks; voice reads the names aloud during the reveal.
  function readVolume(key, fallback) {
    const value = Number(localStorage.getItem(key));
    return localStorage.getItem(key) === null || Number.isNaN(value) ? fallback : Math.min(100, Math.max(0, value));
  }
  // Defaults: effects 40%, voice 100%, reverb on (until the device saves a choice).
  const volume = { sfx: readVolume('sfxVolume', 40), voice: readVolume('voiceVolume', 100), reverb: localStorage.getItem('reverb') !== 'off' };

  let audioContext = null;
  function audio() {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }
  // Browsers only allow sound after a tap, so wake the audio on the first one.
  document.addEventListener('pointerdown', () => { try { audio(); } catch (err) { /* no audio */ } }, { once: true, capture: true });

  function tick(pitch = 660, length = 0.09) {
    if (!volume.sfx) return;
    try {
      audio();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.frequency.value = pitch;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35 * (volume.sfx / 100), audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + length);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + length + 0.02);
    } catch (err) { /* audio not available */ }
  }
  // The boop file is mastered much louder than the voice clips, so scale it down to match at equal settings.
  const BOOP_LEVEL = 0.3;
  function chime() {
    if (!volume.sfx) return;
    const boop = $('boop');
    boop.volume = BOOP_LEVEL * volume.sfx / 100;
    boop.currentTime = 0;
    boop.play().catch(() => {});
  }
  function say(text) {
    if (!volume.voice || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = volume.voice / 100;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  // Recorded voice: the server records each name (MP3, base64) so every device hears the
  // same natural voice.
  const decoded = new Map();
  function decodeClip(base64) {
    if (!decoded.has(base64)) {
      const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
      decoded.set(base64, audio().decodeAudioData(bytes.buffer).catch(() => null));
    }
    return decoded.get(base64);
  }
  // Optional hall echo for recorded names (Sound settings). The echo is noise that is smoothed
  // and dies away quickly, then darkened again, so it adds room without the hiss of raw noise.
  let hall = null;
  function reverb(ctx) {
    if (hall) return hall;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * 1.8);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth += 0.2 * (Math.random() * 2 - 1 - smooth);
        data[i] = smooth * Math.exp(-5.5 * i / rate);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    tone.connect(convolver).connect(wet).connect(ctx.destination);
    hall = tone;
    return hall;
  }
  // Plays a recorded clip if there is one; otherwise the device reads the text.
  async function speak(text, base64) {
    if (!volume.voice) return;
    const buffer = base64 ? await decodeClip(base64).catch(() => null) : null;
    if (!buffer) { say(text); return; }
    try {
      const ctx = audio();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const level = ctx.createGain();
      level.gain.value = volume.voice / 100;
      source.connect(level);
      level.connect(ctx.destination);
      if (volume.reverb) level.connect(reverb(ctx));
      source.start();
    } catch (err) { say(text); }
  }
  let voiceSample = null;
  async function sayEmpire() {
    if (voiceSample === null) {
      voiceSample = (await db.ref('voiceSample').once('value').catch(() => null))?.val() || '';
    }
    speak('Empire', voiceSample);
  }
  function renderSound() {
    const muted = !volume.sfx && !volume.voice;
    document.querySelectorAll('.sound-btn use').forEach(use => use.setAttribute('href', muted ? '#i-sound-off' : '#i-sound-on'));
    [['sfx', 'sfxVolume', 'sfxValue'], ['voice', 'voiceVolume', 'voiceValue']].forEach(([key, input, output]) => {
      $(input).value = volume[key];
      $(input).style.setProperty('--fill', `${volume[key]}%`);
      rollNumber($(output), volume[key] ? `${volume[key]}%` : 'Off');
    });
    $('reverbToggle').setAttribute('aria-checked', String(volume.reverb));
  }
  $('sfxVolume').addEventListener('input', event => {
    volume.sfx = Number(event.target.value);
    localStorage.setItem('sfxVolume', volume.sfx);
    renderSound();
  });
  $('sfxVolume').addEventListener('change', () => chime());
  $('voiceVolume').addEventListener('input', event => {
    volume.voice = Number(event.target.value);
    localStorage.setItem('voiceVolume', volume.voice);
    renderSound();
  });
  $('voiceVolume').addEventListener('change', () => sayEmpire());
  $('reverbToggle').addEventListener('click', () => {
    volume.reverb = !volume.reverb;
    try { localStorage.setItem('reverb', volume.reverb ? 'on' : 'off'); } catch (err) { /* private mode */ }
    renderSound();
    sayEmpire();
  });
  renderSound();

  return {
    tick,
    chime,
    speak,
    decodeClip,
    isVoiceEnabled: () => Boolean(volume.voice),
    clearClips: () => decoded.clear()
  };
}
