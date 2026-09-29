document.addEventListener('DOMContentLoaded', async () => {
  // NOTE ON for development. OFF for deployment.
  // firebase.functions().useFunctionsEmulator('http://localhost:5001');

  const OFFLINE_KICK_MS = 10 * 60 * 1000;
  const AWAY_AFTER_MS = 2 * 60 * 1000;
  const COUNTDOWN_MS = 1000;
  const NAME_MS = 2500;
  const MAX_PLAYERS = 30;
  const colors = ['#4F63D9', '#0E8A74', '#B5487A', '#C0662B', '#6D4FC2', '#2E7FB8', '#8A7A12', '#A8433F'];

  const $ = id => document.getElementById(id);
  const screens = { home: $('homeScreen'), setup: $('setupScreen'), lobby: $('lobbyScreen') };
  const userGameCode = $('userGameCode');
  const userGameCodeHelper = $('userGameCodeHelper');
  const realName = $('realName');
  const realNameHelper = $('realNameHelper');
  const secretName = $('secretName');
  const secretNameHelper = $('secretNameHelper');
  const secretBox = $('secretBox');
  const startButton = $('revealSecrets');

  let uid = null;

  // Handle login
  const signedIn = new Promise(resolve => {
    firebase.auth().onAuthStateChanged(user => {
      if (!user) {
        // Sign in anonymously
        firebase.auth().signInAnonymously().catch(err => {
          console.error(`Error code ${err.code}: ${err.message}`);
        });
      } else {
        // User is signed in. The anonymous account persists in this browser, so a reload
        // (or coming back later) is the same player.
        uid = user.uid;
        if (localStorage.getItem('realName') && !realName.value) {
          realName.value = localStorage.getItem('realName');
        }
        resolve();
      }
    });
  });

  // Start the database instance
  const db = firebase.database();
  const flashNames = firebase.functions().httpsCallable('flashNames');

  // ---------------------------------------------------------------------------
  // Small UI helpers: screens, toast, sheets, sound

  function show(name) {
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    window.scrollTo(0, 0);
    requestAnimationFrame(fitMarquees);
    if (name === 'lobby') requestAnimationFrame(() => { fitTable(); renderLobby(); });
  }

  // Text too long for its box (like a long room code) glides to its end and back.
  function fitMarquees() {
    document.querySelectorAll('.marquee').forEach(box => {
      const text = box.firstElementChild;
      box.classList.remove('is-long');
      if (!box.clientWidth || text.scrollWidth <= box.clientWidth + 1) return;
      box.classList.add('is-long');
      const shift = text.offsetWidth - box.clientWidth;
      box.style.setProperty('--marquee-shift', `${-shift}px`);
      box.style.setProperty('--marquee-time', `${(4 + shift / 30).toFixed(1)}s`);
    });
  }
  window.addEventListener('resize', fitMarquees);
  document.fonts.ready.then(fitMarquees);

  // Numbers roll like an odometer: every place value (ones, tens, hundreds...) owns one slot
  // holding a blank + 0-9 strip. Slots are never reused for another place, so growing or
  // shrinking the number scrolls the same slots up or down and collapses/opens the leftmost ones.
  function makeSlot() {
    const slot = document.createElement('span');
    slot.className = 'odo-digit is-blank';
    slot.setAttribute('aria-hidden', 'true');
    const strip = document.createElement('span');
    strip.className = 'odo-strip';
    for (const ch of ['', ...'0123456789']) {
      const cell = document.createElement('span');
      cell.textContent = ch;
      strip.appendChild(cell);
    }
    slot.appendChild(strip);
    return slot;
  }

  function rollNumber(el, value) {
    const text = String(value);
    if (el.dataset.value === text) return;
    const first = el.dataset.value === undefined;
    el.dataset.value = text;
    el.setAttribute('aria-label', text);
    const match = /^(\d+)(\D*)$/.exec(text);
    if (!match) { // no number to roll (e.g. "Off"): show plain text
      el.dataset.mode = 'text';
      el.replaceChildren(Object.assign(document.createElement('span'), { className: 'odo-char', textContent: text }));
      el.querySelector('.odo-char').setAttribute('aria-hidden', 'true');
      return;
    }
    let slots;
    let suffix;
    if (el.dataset.mode !== 'num') {
      el.dataset.mode = 'num';
      suffix = document.createElement('span');
      suffix.className = 'odo-char';
      suffix.setAttribute('aria-hidden', 'true');
      el.replaceChildren(suffix);
      slots = [];
    } else {
      suffix = el.lastElementChild;
      slots = [...el.children].slice(0, -1).reverse(); // slots[0] is the ones place
    }
    suffix.textContent = match[2];
    const digits = match[1];
    while (slots.length < digits.length) {
      const slot = makeSlot();
      el.insertBefore(slot, slots.length ? slots[slots.length - 1] : suffix);
      slots.push(slot);
    }
    void el.offsetWidth; // newly added slots start blank before they open
    slots.forEach((slot, place) => {
      const ch = digits[digits.length - 1 - place];
      const strip = slot.firstElementChild;
      if (first) strip.style.transition = slot.style.transition = 'none';
      slot.classList.toggle('is-blank', ch === undefined);
      strip.style.transform = `translateY(${-(ch === undefined ? 0 : Number(ch) + 1)}em)`;
    });
    if (first) {
      void el.offsetWidth;
      slots.forEach(slot => { slot.firstElementChild.style.transition = slot.style.transition = ''; });
    }
  }

  let toastTimer = null;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open]');
    if (opener) {
      const open = document.querySelector('dialog[open]');
      if (open) open.close();
      $(opener.dataset.open).showModal();
      return;
    }
    if (event.target.closest('[data-close]')) {
      event.target.closest('dialog').close();
      return;
    }
    // Tap on the backdrop closes a sheet.
    if (event.target.tagName === 'DIALOG') event.target.close();
  });

  // Sound: two volumes (0-100) kept per device. Effects are the join chime and countdown
  // ticks; voice reads the names aloud during the reveal.
  function readVolume(key, fallback) {
    const value = Number(localStorage.getItem(key));
    return localStorage.getItem(key) === null || Number.isNaN(value) ? fallback : Math.min(100, Math.max(0, value));
  }
  // Earlier versions had a single on/off switch for reading names aloud.
  const oldVoiceOn = localStorage.getItem('mute') === 'volume_up';
  const volume = { sfx: readVolume('sfxVolume', 60), voice: readVolume('voiceVolume', oldVoiceOn ? 80 : 0), reverb: localStorage.getItem('reverb') === 'on' };

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
  function chime() {
    if (!volume.sfx) return;
    const boop = $('boop');
    boop.volume = volume.sfx / 100;
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

  // ---------------------------------------------------------------------------
  // Current room. Everything room-specific is attached in enterRoom() and torn
  // down in detachRoom(), so switching rooms never leaves the old room on screen.

  let gameID = null;
  let listeners = [];
  let users = {};
  let presence = {};
  let state = null;
  let locked = false;
  let revealing = false;
  let presenceRef = null;
  let awayTimer = null;

  function listen(ref, callback) {
    ref.on('value', callback);
    listeners.push([ref, callback]);
  }

  function detachRoom() {
    listeners.forEach(([ref, callback]) => ref.off('value', callback));
    listeners = [];
    if (presenceRef) {
      presenceRef.onDisconnect().cancel();
      presenceRef = null;
    }
    clearTimeout(awayTimer);
    gameID = null;
    users = {};
    presence = {};
    state = null;
    locked = false;
    document.title = 'Empire';
    resetLobby();
  }

  function setRoomInUrl(code) {
    const url = new URL(document.location);
    if (code) {
      url.searchParams.set('code', code);
    } else {
      url.searchParams.delete('code');
    }
    history.replaceState(null, '', url);
  }

  function roomLink() {
    const url = new URL(document.location.origin);
    url.searchParams.set('code', gameID);
    return url.href;
  }

  // ---------------------------------------------------------------------------
  // Create or join

  function validCode(code) {
    return code.length <= 128 && !/[.#$[\]/]/.test(code);
  }

  function codeError(message) {
    userGameCode.classList.add('invalid');
    userGameCodeHelper.textContent = message;
  }

  function clearCodeError() {
    userGameCode.classList.remove('invalid');
    userGameCodeHelper.textContent = '';
  }
  userGameCode.addEventListener('input', clearCodeError);

  async function doesGameExist(code) {
    if (code === '') return false;
    let snapshot = await db.ref(`games/${code}/state`).once('value');
    return snapshot.exists();
  }

  // A readable random room code, e.g. amber-comet-42.
  async function randomCode() {
    // Short words keep the code easy to read out and small enough for the table centre.
    const short = (await wordList()).filter(w => w.length >= 3 && w.length <= 6);
    for (let i = 0; i < 5; i++) {
      const code = `${pickRandom(short)}-${pickRandom(short)}-${Math.floor(Math.random() * 90) + 10}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!await doesGameExist(code)) return code;
    }
    return db.ref('games').push().key;
  }

  async function tryCreating() {
    const code = userGameCode.value.trim();
    if (!validCode(code)) {
      codeError('Room codes can\'t contain . # $ [ ] or /');
      return;
    }
    if (await doesGameExist(code)) {
      codeError(`${code} already exists. Join it or pick another code.`);
      return;
    }
    const newCode = code || await randomCode();
    await db.ref(`games/${newCode}`).set({ state: 'waiting', createdAt: firebase.database.ServerValue.TIMESTAMP });
    await enterRoom(newCode);
  }

  async function tryJoining(code = userGameCode.value.trim()) {
    if (!validCode(code) || !await doesGameExist(code)) {
      userGameCode.value = code;
      codeError(code ? `${code} doesn't exist. Check the code or create a room with it.` : 'Enter a room code to join.');
      setRoomInUrl(null);
      show('home');
      return;
    }
    await enterRoom(code);
  }

  $('roomForm').addEventListener('submit', event => {
    event.preventDefault();
    tryCreating();
  });
  $('joinButton').addEventListener('click', () => tryJoining());

  async function enterRoom(code) {
    await signedIn;
    if (gameID && gameID !== code) {
      await leaveRoom({ goHome: false });
    }
    detachRoom();
    gameID = code;
    document.title = `Empire: ${gameID}`;
    setRoomInUrl(gameID);
    document.querySelectorAll('.room-name').forEach(el => { el.textContent = gameID; });
    requestAnimationFrame(fitMarquees);

    // Reset the create form so it never points at the previous room.
    userGameCode.value = '';
    clearCodeError();

    startPresence();

    const me = await db.ref(`games/${gameID}/users/${uid}`).once('value');
    users = me.exists() ? { [uid]: me.val() } : {};

    let first = true;
    listen(db.ref(`games/${gameID}/users`), snapshot => {
      const hadMe = Boolean(users[uid]);
      users = snapshot.val() || {};
      renderLobby();

      if (!first) chime();
      first = false;

      // Removed by someone else (for example after being offline too long).
      if (hadMe && !users[uid] && state !== 'resetting' && state !== 'deleting') {
        toast('You were removed from the lobby. Enter your names to rejoin.');
        openSetup();
      }
    });
    listen(db.ref(`games/${gameID}/presence`), snapshot => {
      presence = snapshot.val() || {};
      renderLobby();
    });
    listen(db.ref(`games/${gameID}/state`), onStateChange);
    locked = (await db.ref(`games/${gameID}/locked`).once('value')).val() === true;
    listen(db.ref(`games/${gameID}/locked`), snapshot => {
      locked = snapshot.val() === true;
      renderLobby();
    });

    if (!users[uid] && locked) {
      // The names have been revealed: newcomers watch until the next round.
      show('lobby');
    } else if (users[uid]) {
      realName.value = users[uid].real;
      setSecret(sessionStorage.getItem(`secret:${gameID}`) || '');
      show('lobby');
    } else {
      openSetup();
    }
  }

  // Leave the current room: remove my entry so nobody waits on me.
  async function leaveRoom({ goHome = true } = {}) {
    if (!gameID) return;
    const code = gameID;
    if (presenceRef) {
      await presenceRef.onDisconnect().cancel();
    }
    // Stop listening first so removing myself isn't mistaken for being removed.
    detachRoom();
    await db.ref(`games/${code}`).update({
      [`users/${uid}`]: null,
      [`secrets/${uid}`]: null,
      [`presence/${uid}`]: null
    }).catch(err => console.error(err));
    sessionStorage.removeItem(`secret:${code}`);
    if (goHome) {
      setRoomInUrl(null);
      show('home');
    }
  }

  $('leaveRoom').addEventListener('click', () => {
    $('optionsDialog').close();
    leaveRoom();
  });
  $('setupBack').addEventListener('click', () => {
    // Back from editing names returns to the lobby; otherwise it leaves the room.
    if (users[uid]) show('lobby');
    else leaveRoom();
  });

  // ---------------------------------------------------------------------------
  // Presence: online/offline is tracked by the server connection, away by tab visibility.

  function startPresence() {
    presenceRef = db.ref(`games/${gameID}/presence/${uid}`);
    const ref = presenceRef;
    listen(db.ref('.info/connected'), async snapshot => {
      if (snapshot.val() !== true || ref !== presenceRef) return;
      // A full set (not update): the rules require online + lastSeen together.
      await ref.onDisconnect().set({ online: false, away: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      await ref.set({ online: true, away: document.hidden, lastSeen: firebase.database.ServerValue.TIMESTAMP, name: (localStorage.getItem('realName') || 'Guest').slice(0, 100) });
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!presenceRef) return;
    clearTimeout(awayTimer);
    if (document.hidden) {
      const ref = presenceRef;
      awayTimer = setTimeout(() => {
        ref.update({ away: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      }, AWAY_AFTER_MS);
    } else {
      presenceRef.update({ online: true, away: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }
  });

  // ---------------------------------------------------------------------------
  // Share

  document.querySelectorAll('.share-btn').forEach(btn => btn.addEventListener('click', async () => {
    if (!gameID) return;
    const link = roomLink();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Empire', text: `Join my Empire game: ${gameID}`, url: link });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast(link));
  }));

  // ---------------------------------------------------------------------------
  // Pick names

  const SECRET_MAX = 28; // keep in sync with maxlength in index.html and database.rules.json

  function sanitizeName(raw) {
    //TODO different rules for allowed characters etc.
    return raw.toLowerCase().replace(/[^ A-Za-z0-9]/g, '').replace(/\s+/g, ' ').trim();
  }

  // The secret field draws its own dots and letters over a transparent input, so
  // show/hide can animate each character (a dot spins away as its letter flips up).
  const glyphs = $('secretGlyphs');
  let secretShown = false;

  function renderGlyphs() {
    const chars = [...secretName.value];
    while (glyphs.children.length > chars.length) glyphs.lastChild.remove();
    chars.forEach((ch, i) => {
      let el = glyphs.children[i];
      if (!el) {
        el = document.createElement('span');
        el.className = 'ch';
        el.innerHTML = '<span class="ch-dot"></span><span class="ch-letter"></span>';
        glyphs.appendChild(el);
      }
      el.lastChild.textContent = ch;
      // Reveal ripples left to right; hiding folds back right to left.
      el.style.setProperty('--d', `${(secretShown ? i : chars.length - 1 - i) * 45}ms`);
    });
    glyphs.style.transform = `translateX(${-secretName.scrollLeft}px)`;
  }

  function setSecret(value) {
    secretName.value = value;
    renderGlyphs();
  }

  secretName.addEventListener('input', () => {
    secretBox.classList.remove('invalid');
    secretNameHelper.textContent = '';
    renderGlyphs();
  });
  secretName.addEventListener('scroll', renderGlyphs);
  $('togglePassword').addEventListener('click', () => {
    secretShown = !secretShown;
    renderGlyphs();
    secretBox.classList.toggle('open', secretShown);
    $('togglePassword').setAttribute('aria-pressed', String(secretShown));
    $('togglePassword').setAttribute('aria-label', secretShown ? 'Hide secret name' : 'Show secret name');
  });

  function openSetup() {
    $('submitLabel').textContent = users[uid] ? 'Save names' : 'Enter the lobby';
    show('setup');
  }

  realName.addEventListener('input', () => {
    realName.classList.remove('invalid');
    realNameHelper.textContent = '';
  });

  $('namesForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!gameID) return;

    const userRealName = realName.value.trim().slice(0, 100);
    const userFakeName = sanitizeName(secretName.value).slice(0, SECRET_MAX);
    let ok = true;

    const taken = Object.entries(users).some(([key, user]) =>
      key !== uid && user.real && user.real.toLowerCase() === userRealName.toLowerCase());
    if (userRealName === '') {
      realName.classList.add('invalid');
      realNameHelper.textContent = 'Enter your name';
      ok = false;
    } else if (taken) {
      realName.classList.add('invalid');
      realNameHelper.textContent = 'Someone in this room already uses that name';
      ok = false;
    }

    if (userFakeName === '') {
      secretBox.classList.add('invalid');
      secretNameHelper.textContent = 'Pick a secret name (letters and numbers)';
      ok = false;
    }

    if (!ok) return;

    localStorage.setItem('realName', userRealName);
    sessionStorage.setItem(`secret:${gameID}`, userFakeName);

    // Leaving the reset screen: mark the room waiting first so nobody still clearing
    // the old round can wipe this entry.
    if (state === 'resetting') {
      await db.ref(`games/${gameID}`).update({ state: 'waiting' });
    }

    if (locked && !users[uid]) {
      toast('This round has started. You can watch and join at the next round.');
      show('lobby');
      return;
    }

    // The player entry is public; the secret name is stored where only the server can read it.
    // Right after a New round the server may still be unlocking the room, so retry briefly.
    for (let attempt = 0; ; attempt++) {
      try {
        await db.ref(`games/${gameID}`).update({
          [`users/${uid}`]: { real: userRealName, clan: userRealName },
          [`secrets/${uid}`]: userFakeName
        });
        break;
      } catch (err) {
        if (attempt >= 4) {
          toast(locked ? 'Names are locked until the next round.' : 'Could not save your names. Try again.');
          return;
        }
        await sleep(700);
      }
    }

    show('lobby');
  });

  $('editNames').addEventListener('click', () => {
    $('optionsDialog').close();
    if (locked) {
      toast('Names are locked until the next round.');
      return;
    }
    if (users[uid]) {
      realName.value = users[uid].real;
    }
    setSecret(sessionStorage.getItem(`secret:${gameID}`) || '');
    openSetup();
  });

  // ---------------------------------------------------------------------------
  // Senate table: players sit around the table clockwise; past 11 players a second
  // (then third) inner ring opens. Seats per ring are proportional to the ring's size,
  // so everyone gets about the same shoulder room, and no ring has fewer than 3.

  const LAYOUTS = [
    { R: [132], caps: [11], S: 52, f: 13, lw: 72, disc: 78, room: 15, num: 50, unit: 13, wait: 12 },
    { R: [148, 88], caps: [14, 8], S: 40, f: 11, lw: 64, disc: 56, room: 12, num: 36, unit: 11, wait: 11 },
    { R: [164, 116, 70], caps: [16, 11, 6], S: 30, f: 10, lw: 52, disc: 44, room: 10, num: 26, unit: 10, wait: 10 }
  ];
  const layoutFor = n => LAYOUTS[n <= 11 ? 0 : n <= 22 ? 1 : 2];

  function share(n, R, caps) {
    const k = R.length;
    const lo = R.map(() => (k > 1 ? 3 : 0));
    const fixed = R.map(() => null);
    for (;;) {
      const left = n - fixed.reduce((sum, v) => sum + (v || 0), 0);
      const free = R.reduce((sum, r, i) => sum + (fixed[i] === null ? r : 0), 0);
      const ideal = R.map((r, i) => (fixed[i] !== null ? fixed[i] : (left * r) / free));
      const bad = ideal.findIndex((v, i) => fixed[i] === null && (v < lo[i] || v > caps[i]));
      if (bad < 0) {
        const seats = ideal.map(Math.floor);
        let extra = n - seats.reduce((sum, v) => sum + v, 0);
        ideal.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
          .forEach(([, i]) => { if (extra > 0 && seats[i] < caps[i]) { seats[i]++; extra--; } });
        return seats;
      }
      fixed[bad] = ideal[bad] < lo[bad] ? lo[bad] : caps[bad];
    }
  }
  // Precomputed seats per ring for every room size.
  const SEATING = Array.from({ length: MAX_PLAYERS + 1 }, (_, n) => share(n, layoutFor(n).R, layoutFor(n).caps));
  const seatsFor = n => (n <= MAX_PLAYERS ? SEATING[n] : share(n, layoutFor(n).R, layoutFor(n).R.map(() => Infinity)));

  const norm = a => ((a % 360) + 360) % 360;
  const circDist = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, 360 - d); };
  function gapMiddle(angles) {
    if (angles.length === 0) return 0;
    const sorted = angles.map(norm).sort((a, b) => a - b);
    let best = 0, mid = sorted[0] + 180;
    sorted.forEach((a, i) => {
      const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360;
      if (next - a > best) { best = next - a; mid = a + (next - a) / 2; }
    });
    return mid;
  }

  const seatRing = new Map();
  const seatAngle = new Map();

  // Seats stay put where possible: players keep their ring, a ring that is over its
  // share hands the player nearest to the other ring's biggest gap inward/outward (so they
  // move almost straight across), and each ring rotates as little as possible.
  function assignSeats(ids) {
    const n = ids.length;
    const L = layoutFor(n);
    const k = L.R.length;
    const counts = seatsFor(n);
    [...seatRing.keys()].forEach(id => { if (!ids.includes(id)) seatRing.delete(id); });

    const rings = Array.from({ length: k }, () => []);
    const newcomers = [];
    ids.forEach(id => (seatRing.has(id) ? rings[Math.min(seatRing.get(id), k - 1)].push(id) : newcomers.push(id)));
    newcomers.forEach(id => {
      let best = 0, room = -Infinity;
      rings.forEach((m, r) => { if (counts[r] - m.length > room) { room = counts[r] - m.length; best = r; } });
      rings[best].push(id);
    });

    for (;;) {
      const over = rings.findIndex((m, r) => m.length > counts[r]);
      const under = rings.findIndex((m, r) => m.length < counts[r]);
      if (over < 0 || under < 0) break;
      const target = gapMiddle(rings[under].filter(id => seatAngle.has(id)).map(id => seatAngle.get(id)));
      let pick = rings[over][rings[over].length - 1], nearest = Infinity;
      rings[over].forEach(id => {
        const d = seatAngle.has(id) ? circDist(seatAngle.get(id), target) : 360;
        if (d < nearest) { nearest = d; pick = id; }
      });
      rings[over].splice(rings[over].indexOf(pick), 1);
      rings[under].push(pick);
    }

    const seats = new Map();
    rings.forEach((members, r) => {
      const c = members.length;
      if (!c) return;
      const step = 360 / c;
      const known = members.filter(id => seatAngle.has(id));
      members.forEach((id, i) => {
        if (seatAngle.has(id)) return;
        // A first seating goes clockwise in join order; later arrivals take the widest gap.
        seatAngle.set(id, known.length ? gapMiddle(members.filter(m => seatAngle.has(m)).map(m => seatAngle.get(m))) : i * step + (r % 2 ? step / 2 : 0));
      });
      const sorted = members.slice().sort((a, b) => norm(seatAngle.get(a)) - norm(seatAngle.get(b)));
      // Rotate the evenly spaced seats to where people already are (least total movement).
      let sx = 0, sy = 0;
      sorted.forEach((id, j) => {
        const d = ((seatAngle.get(id) - j * step) * Math.PI) / 180;
        sx += Math.cos(d);
        sy += Math.sin(d);
      });
      const offset = sx || sy ? (Math.atan2(sy, sx) * 180) / Math.PI : 0;
      sorted.forEach((id, j) => {
        let a = j * step + offset;
        a += 360 * Math.round((seatAngle.get(id) - a) / 360); // take the short way round
        seatAngle.set(id, a);
        seatRing.set(id, r);
        seats.set(id, { a, R: L.R[r] });
      });
    });
    return { L, seats };
  }

  // ---------------------------------------------------------------------------
  // Lobby rendering. Every player keeps their own element for their whole stay (keyed
  // by id), so joining and leaving animate without anyone flickering or swapping.

  let order = [];
  const seatEls = new Map();
  const rowEls = new Map();
  let view = localStorage.getItem('lobbyView') === 'list' ? 'list' : 'table';

  function resetLobby() {
    order = [];
    seatRing.clear();
    seatAngle.clear();
    seatEls.forEach(({ el }) => el.remove());
    rowEls.forEach(({ el }) => el.remove());
    seatEls.clear();
    rowEls.clear();
  }

  function colorFor(key) {
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return colors[hash % colors.length];
  }

  function minutesAgo(time) {
    const minutes = Math.floor((Date.now() - time) / 60000);
    return minutes < 1 ? 'just now' : `${minutes}m ago`;
  }

  function playerInfo(key, user) {
    const seen = presence[key];
    const bot = Boolean(user.fakeBadge);
    const you = key === uid;
    const offline = !bot && seen && seen.online === false;
    const away = !bot && !offline && seen && seen.away;
    let status = bot ? 'Bot' : offline ? `Offline · ${minutesAgo(seen.lastSeen)}` : away ? 'Away' : 'Online';
    if (you) status = 'You';
    return {
      key, bot, you, offline, away,
      name: user.real,
      status,
      color: bot ? '#2B3170' : offline ? '#3A3E63' : colorFor(key),
      removable: !you && (bot || (offline && Date.now() - seen.lastSeen > OFFLINE_KICK_MS))
    };
  }

  function removePlayer(key, onFail) {
    db.ref(`games/${gameID}`).update({
      [`users/${key}`]: null,
      [`secrets/${key}`]: null
    }).catch(() => {
      toast('Could not remove that player');
      if (onFail) onFail();
    });
  }

  function avatarHtml() {
    return '<span class="avatar"><span class="initial"></span><svg class="icon bot-icon"><use href="#i-bot" /></svg><span class="dot"></span></span>';
  }

  function paintAvatar(avatar, p, size) {
    avatar.style.background = p.color;
    if (size) {
      avatar.style.width = `${size}px`;
      avatar.style.height = `${size}px`;
      avatar.style.fontSize = `${Math.round(size * 0.46)}px`;
    }
    avatar.classList.toggle('is-bot', p.bot);
    avatar.classList.toggle('is-offline', p.offline);
    avatar.classList.toggle('is-you', p.you);
    avatar.querySelector('.initial').textContent = p.bot ? '' : [...p.name][0].toUpperCase();
    avatar.querySelector('.bot-icon').style.display = p.bot ? '' : 'none';
    const dot = avatar.querySelector('.dot');
    dot.hidden = p.bot;
    dot.className = `dot${p.away ? ' away' : p.offline ? ' offline' : ''}`;
  }

  function makeRemoveButton(cls) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.innerHTML = '<svg class="icon"><use href="#i-x" /></svg>';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      btn.disabled = true;
      removePlayer(btn.dataset.key, () => { btn.disabled = false; });
    });
    return btn;
  }

  let lastCenter = null;
  document.fonts.ready.then(() => { centerFit = ''; if (lastCenter) fitCenter(...lastCenter); });

  function fitTable() {
    const width = $('tableView').clientWidth;
    if (width > 0) $('tableInner').style.transform = `scale(${Math.min(1, width / 390)})`;
    if (width > 0 && lastCenter) fitCenter(...lastCenter);
  }
  window.addEventListener('resize', fitTable);

  function renderLobby() {
    if (!gameID) return;
    const entries = Object.entries(users).filter(([, user]) => user && user.real);
    const keys = entries.map(([key]) => key);

    // Stable seating order: first seen first; newcomers are added at the end.
    order = order.filter(key => keys.includes(key));
    keys.filter(key => !order.includes(key)).sort().forEach(key => order.push(key));

    const players = order.map(key => playerInfo(key, users[key]));
    const count = players.length;
    const waiting = players.filter(p => p.away || p.offline).map(p => p.name);
    const waitingText = waiting.length === 0 ? (count < 2 ? 'Need 2 to start' : 'Everyone is here')
      : waiting.length <= 2 && count <= 11 ? `Waiting for ${waiting.join(', ')}` : `${waiting.length} away`;

    const spectator = !users[uid];
    const watchers = Object.entries(presence)
      .filter(([key, seen]) => seen && seen.online && !users[key])
      .map(([key, seen]) => (key === uid ? 'You' : seen.name || 'Guest'));
    $('watching').hidden = watchers.length === 0;
    const chips = $('watchingNames');
    chips.replaceChildren(...watchers.map(name => {
      const chip = document.createElement('span');
      chip.className = 'watch-chip';
      chip.textContent = name;
      return chip;
    }));
    $('lockNote').hidden = !spectator && !locked;
    $('lockText').textContent = spectator
      ? 'Names are set for this round. You can watch and join at the next round.'
      : 'Names are set for this round. New players can watch and join next round.';
    $('generateName').hidden = spectator;
    startButton.hidden = spectator;
    $('generateName').classList.toggle('is-disabled', locked);
    const preparing = state === 'shuffling';
    $('revealLabel').textContent = preparing ? 'Getting voices ready' : locked ? 'Read the names again' : 'Reveal the names';
    if (preparing) startButton.querySelector('.spinner').hidden = false;
    $('revealIcon').setAttribute('href', locked ? '#i-refresh' : '#i-play');
    startButton.classList.toggle('btn-quiet', locked);

    rollNumber($('playerCount'), count);
    $('waitingText').textContent = waitingText;
    $('listSummary').textContent = `${count} player${count === 1 ? '' : 's'} · ${waitingText.toLowerCase()}`;
    startButton.classList.toggle('is-disabled', count < 2 || revealing || preparing);
    $('generateName').disabled = count >= MAX_PLAYERS;

    renderTable(players);
    renderList(players);
  }

  // The status line sits low in the disc, where the circle narrows: pick the largest
  // size (on an invisible copy, so the real one still animates) that stays inside.
  let centerFit = '';
  function fitCenter(center, L) {
    const wait = center.querySelector('.tc-wait');
    const key = [L.disc, wait.textContent].join('|');
    if (key === centerFit || !center.offsetParent) return; // unchanged, or the table isn't showing
    centerFit = key;

    const probe = center.cloneNode(true);
    probe.removeAttribute('id');
    probe.classList.add('measuring');
    Object.assign(probe.style, { width: `${2 * L.disc}px`, height: `${2 * L.disc}px`, left: '0', top: '0' });
    $('tableInner').appendChild(probe);
    const pWait = probe.querySelector('.tc-wait');

    const r = L.disc - 7;
    const inside = el => {
      const x = el.offsetLeft - L.disc, y = el.offsetTop - L.disc, w = el.offsetWidth, h = el.offsetHeight;
      return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].every(([a, b]) => a * a + b * b <= r * r);
    };
    const apply = (el, o) => Object.assign(el.style, { fontSize: `${o.size}px`, maxWidth: `${o.width}px` });
    const options = [];
    [1.5, 1.35, 1.2].forEach(width => {
      for (let size = L.wait; size >= L.wait * 0.8; size -= 0.5) options.push({ size, width: Math.round(L.disc * width) });
    });
    let chosen = options[options.length - 1];
    for (const o of options) { apply(pWait, o); if (inside(pWait)) { chosen = o; break; } }
    probe.remove();
    apply(wait, chosen);
  }

  function renderTable(players) {
    const { L, seats } = assignSeats(players.map(p => p.key));
    const cx = 195, cy = 195, S = L.S;

    const guides = $('ringGuides');
    while (guides.children.length > L.R.length) guides.lastChild.remove();
    L.R.forEach((R, r) => {
      let g = guides.children[r];
      if (!g) { g = document.createElement('div'); g.className = 'ring-guide'; guides.appendChild(g); }
      Object.assign(g.style, { left: `${cx - R}px`, top: `${cy - R}px`, width: `${2 * R}px`, height: `${2 * R}px`, opacity: String(1 - r * 0.25) });
    });

    const center = $('tableCenter');
    Object.assign(center.style, { left: `${cx - L.disc}px`, top: `${cy - L.disc}px`, width: `${2 * L.disc}px`, height: `${2 * L.disc}px` });
    center.querySelector('.tc-count').style.fontSize = `${L.num}px`;
    center.querySelector('.tc-unit').style.fontSize = `${L.unit}px`;
    lastCenter = [center, L];
    fitCenter(center, L);

    const container = $('seats');
    const live = new Set(players.map(p => p.key));
    seatEls.forEach((entry, key) => {
      if (live.has(key) || entry.leaving) return;
      entry.leaving = true;
      entry.el.classList.remove('pop');
      entry.el.classList.add('gone');
      setTimeout(() => { entry.el.remove(); seatEls.delete(key); }, 420);
    });

    const lh = Math.round(L.f * 1.3);
    players.forEach(p => {
      let entry = seatEls.get(p.key);
      if (entry && entry.leaving) { entry.el.remove(); seatEls.delete(p.key); entry = null; }
      if (!entry) {
        const el = document.createElement('div');
        el.className = 'seat pop';
        el.innerHTML = `<div class="seat-inner">${avatarHtml()}<span class="seat-label"></span></div>`;
        const x = makeRemoveButton('seat-x');
        el.querySelector('.seat-inner').appendChild(x);
        container.appendChild(el);
        setTimeout(() => el.classList.remove('pop'), 600);
        entry = { el, avatar: el.querySelector('.avatar'), label: el.querySelector('.seat-label'), x };
        seatEls.set(p.key, entry);
      }
      const { a, R } = seats.get(p.key);
      const upper = Math.cos((a * Math.PI) / 180) > 0.05;
      entry.el.style.top = `${cy - S / 2}px`;
      entry.el.style.height = `${S}px`;
      entry.el.style.transform = `rotate(${a.toFixed(2)}deg) translateY(${-R}px) rotate(${(-a).toFixed(2)}deg)`;
      entry.el.classList.toggle('dim', p.away || p.offline);
      paintAvatar(entry.avatar, p, S);
      // Names sit on the outer side of each seat so they never cover the centre.
      Object.assign(entry.label.style, {
        left: `${36 - L.lw / 2}px`, width: `${L.lw}px`, top: `${upper ? -(lh + 3) : S + 3}px`,
        lineHeight: `${lh}px`, fontSize: `${L.f}px`
      });
      entry.label.textContent = p.name;
      entry.label.classList.toggle('you', p.you);
      entry.x.hidden = !p.removable;
      entry.x.dataset.key = p.key;
      entry.x.setAttribute('aria-label', `Remove ${p.name}`);
      entry.x.style.left = `${36 + S / 2 - 12}px`;
    });
  }

  const rowGap = list => parseFloat(getComputedStyle(list).rowGap) || 0;

  function renderList(players) {
    const list = $('nameList');
    const live = new Set(players.map(p => p.key));
    // Remember where every row is, so rows that shift (when a player leaves or joins)
    // glide to their new place instead of jumping.
    const before = new Map();
    rowEls.forEach(entry => { if (!entry.leaving) before.set(entry.el, entry.el.getBoundingClientRect().top); });
    rowEls.forEach((entry, key) => {
      if (live.has(key) || entry.leaving) return;
      entry.leaving = true;
      // The row burns away in place, so nothing slides under it; only once it's
      // gone does its space close up, carrying the rows below with it.
      const el = entry.el;
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        const collapse = el.animate([
          { height: `${el.offsetHeight}px` },
          { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px', marginBottom: `${-rowGap(list)}px` }
        ], { duration: 260, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
        collapse.onfinish = () => { el.remove(); if (rowEls.get(key) === entry) rowEls.delete(key); };
      };
      el.addEventListener('animationend', e => { if (e.animationName === 'ember') close(); });
      setTimeout(close, 600);
      el.classList.add('gone');
    });
    const liveRows = () => [...list.children].filter(row => !row.classList.contains('gone'));
    players.forEach((p, i) => {
      let entry = rowEls.get(p.key);
      if (entry && entry.leaving) { entry.el.remove(); rowEls.delete(p.key); entry = null; }
      if (!entry) {
        const el = document.createElement('li');
        el.className = 'row pop';
        el.innerHTML = `${avatarHtml()}<span class="row-name"></span><span class="row-status"></span>`;
        const x = makeRemoveButton('row-x');
        el.appendChild(x);
        setTimeout(() => el.classList.remove('pop'), 500);
        entry = { el, avatar: el.querySelector('.avatar'), x };
        rowEls.set(p.key, entry);
      }
      const here = liveRows()[i];
      if (here !== entry.el) list.insertBefore(entry.el, here || null);
      entry.el.classList.toggle('you', p.you);
      entry.el.classList.toggle('offline', p.offline);
      entry.el.classList.toggle('dim', p.away || p.offline);
      paintAvatar(entry.avatar, p);
      entry.el.querySelector('.row-name').textContent = p.name;
      entry.el.querySelector('.row-status').textContent = p.status;
      entry.x.hidden = !p.removable;
      entry.x.dataset.key = p.key;
      entry.x.setAttribute('aria-label', `Remove ${p.name}`);
    });
    before.forEach((top, el) => {
      if (!el.isConnected) return;
      const dy = top - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    });
  }

  function setView(next) {
    view = next;
    try { localStorage.setItem('lobbyView', view); } catch (err) { /* private mode */ }
    document.querySelector('.seg').classList.toggle('list', view === 'list');
    document.querySelectorAll('.seg-btn').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.view === view)));
    $('tableView').hidden = view !== 'table';
    $('listView').hidden = view !== 'list';
    $('listSummary').hidden = view !== 'list';
    if (view === 'table') requestAnimationFrame(fitTable);
  }
  document.querySelectorAll('.seg-btn').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  setView(view);

  // Refresh "offline · Xm ago" labels and the remove buttons as time passes.
  setInterval(renderLobby, 30000);

  // Bots

  let fakeNameList = [];
  let fakeSecretList = [];

  async function populateList(url) {
    const response = await fetch(url);
    const text = await response.text();
    return text.split('\n').map(line => line.trim()).filter(Boolean);
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async function wordList() {
    if (fakeSecretList.length === 0) fakeSecretList = await populateList('words.txt');
    return fakeSecretList;
  }

  $('generateName').addEventListener('click', async () => {
    if (!gameID) return;
    if (locked) {
      toast('The room is locked until the next round.');
      return;
    }
    if (fakeNameList.length === 0) fakeNameList = await populateList('names.txt');
    await wordList();
    const fakeName = pickRandom(fakeNameList);
    const fakeSecret = pickRandom(fakeSecretList);
    const fakeID = db.ref(`games/${gameID}/users`).push().key;

    // add the fake player and their secret together
    await db.ref(`games/${gameID}`).update({
      [`users/${fakeID}`]: { game: gameID, real: fakeName, clan: fakeName, fakeBadge: true },
      [`secrets/${fakeID}`]: fakeSecret
    });
  });

  $('roomResetButton').addEventListener('click', () => {
    db.ref(`games/${gameID}`).update({ state: 'resetting' });
  });

  $('roomDeleteButton').addEventListener('click', () => {
    db.ref(`games/${gameID}`).update({ state: 'deleting' });
  });

  startButton.addEventListener('click', async () => {
    if (startButton.classList.contains('is-disabled')) {
      if (Object.keys(users).length < 2) toast('You need at least 2 players. Add a bot or share the link.');
      return;
    }
    const spinner = startButton.querySelector('.spinner');
    spinner.hidden = false;
    startButton.classList.add('is-disabled');

    try {
      await flashNames({ text: gameID });
    } catch (err) {
      toast(err.message);
    } finally {
      spinner.hidden = true;
      renderLobby();
    }
  });

  async function onStateChange(snapshot) {
    const previous = state;
    state = snapshot.val();
    const code = gameID;

    if (state === 'playing' && previous !== 'playing') {
      displaySecrets();
    }
    // While the server records the names, everyone sees the Start button waiting.
    if (state === 'shuffling' || previous === 'shuffling') {
      if (previous === 'shuffling') startButton.querySelector('.spinner').hidden = true;
      renderLobby();
    }
    if (state === 'deleting' || (state === null && previous !== null)) {
      // Stop listening first so the room disappearing doesn't trigger this twice.
      detachRoom();
      await db.ref(`games/${code}`).remove().catch(() => {});
      sessionStorage.removeItem(`secret:${code}`);
      window.location.replace('/');
    }
    if (state === 'resetting' && previous !== 'resetting') {
      await db.ref(`games/${code}`).update({
        [`users/${uid}`]: null,
        [`secrets/${uid}`]: null
      }).catch(() => {});
      setSecret('');
      sessionStorage.removeItem(`secret:${code}`);
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      $('submitLabel').textContent = 'Enter the lobby';
      show('setup');
      await db.ref(`games/${code}/users`).remove().catch(() => {});
      await db.ref(`games/${code}/secrets`).remove().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Countdown + reveal: nothing on screen but the name and its sliding timer.

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Long names shrink to stay on one line; only very long ones wrap.
  function fitWord(word, box) {
    const room = box.clientWidth - 56;
    let size = 80;
    while (word.scrollWidth > room && size > 36) {
      size -= 4;
      word.style.fontSize = `${size}px`;
    }
    if (word.scrollWidth > room) word.classList.add('wrap');
  }

  // Everyone follows the server's clock: startedAt is a server timestamp, so a player who
  // reloads or arrives mid-reveal joins at the current name instead of getting a replay.
  let serverOffset = 0;
  db.ref('.info/serverTimeOffset').on('value', snap => { serverOffset = snap.val() || 0; });
  const serverNow = () => Date.now() + serverOffset;

  function showStep(stage, timer, bar, step, into, names, clips) {
    if (step < 3) {
      timer.hidden = true;
      stage.innerHTML = `<div class="count"><span class="count-burst"></span><span class="count-num display">${3 - step}</span></div>`;
      if (into < 250) tick(step === 2 ? 880 : 660);
      return;
    }
    const name = names[step - 3];
    const word = document.createElement('div');
    word.className = 'reveal-name display';
    word.textContent = name;
    stage.replaceChildren(word);
    fitWord(word, stage);
    timer.hidden = false;
    bar.classList.remove('run');
    void bar.offsetWidth; // restart the timer animation
    bar.style.animationDelay = `${-into}ms`;
    bar.classList.add('run');
    if (into < 250 && step === 3) tick(990, 0.18);
    if (into < 800) speak(name, clips[step - 3]);
  }

  async function displaySecrets() {
    if (revealing) return;
    revealing = true;
    const code = gameID;
    const [namesSnap, startSnap] = await Promise.all([
      db.ref(`games/${code}/names`).once('value'),
      db.ref(`games/${code}/startedAt`).once('value')
    ]);
    const names = namesSnap.val() || [];
    const startedAt = startSnap.val() || serverNow();
    const countdown = 3 * COUNTDOWN_MS;
    const total = countdown + names.length * NAME_MS;
    const stillHere = () => gameID === code && state === 'playing';

    const reveal = $('revealScreen');
    const stage = $('revealStage');
    const timer = $('revealTimer');
    const bar = $('revealBar');
    bar.style.setProperty('--t', `${NAME_MS}ms`);

    // Recorded names arrive during the countdown; decode each as soon as it lands.
    const clips = [];
    const voiceRef = db.ref(`games/${code}/voice`);
    const onVoice = snap => {
      const value = snap.val() || {};
      Object.keys(value).forEach(i => {
        clips[i] = value[i];
        if (volume.voice) decodeClip(value[i]);
      });
    };
    voiceRef.on('value', onVoice, () => {});

    let shown = -1;
    while (stillHere()) {
      const t = serverNow() - startedAt;
      if (t >= total) break;
      const step = t < countdown ? Math.floor(t / COUNTDOWN_MS) : 3 + Math.floor((t - countdown) / NAME_MS);
      if (step !== shown) {
        if (shown === -1) {
          document.querySelectorAll('dialog[open]').forEach(d => d.close());
          reveal.hidden = false;
        }
        shown = step;
        const stepStart = step < 3 ? step * COUNTDOWN_MS : countdown + (step - 3) * NAME_MS;
        showStep(stage, timer, bar, step, t - stepStart, names, clips);
      }
      await sleep(60);
    }

    voiceRef.off('value', onVoice);
    decoded.clear();
    revealing = false;
    reveal.hidden = true;
    stage.innerHTML = '';
    bar.classList.remove('run');
    // The reveal is over (or was already over when this player arrived).
    if (stillHere() && serverNow() - startedAt >= total) {
      db.ref(`games/${code}`).update({ state: 'waiting' });
    }
    renderLobby();
  }

  // ---------------------------------------------------------------------------
  // Open the room from a game link (a reload keeps ?code= in the address bar).

  let urlCode = (new URL(document.location)).searchParams.get('code');
  if (urlCode) {
    tryJoining(urlCode);
  } else {
    show('home');
  }
});
