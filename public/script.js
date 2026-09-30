import { SHAPES, COLORS, METALS, PATTERNS, EMBLEMS, parseCrest, crestString, randomCrest, defaultCrest, botCrest, crestSvg, crestDefs } from './crest.js';
import { suggestRoomName } from './room-names.js';

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

  // Sheets slide back down (or fade out on wide screens) before they close. The `close`
  // event tidies up however the dialog actually closed.
  function closeSheet(dialog) {
    if (!dialog.open || dialog.classList.contains('closing')) return;
    dialog.classList.add('closing');
    const fallback = setTimeout(() => dialog.close(), 400);
    const done = event => {
      if (event.target === dialog && !event.pseudoElement) dialog.close();
    };
    dialog.addEventListener('animationend', done);
    dialog.addEventListener('close', () => {
      clearTimeout(fallback);
      dialog.removeEventListener('animationend', done);
    }, { once: true });
  }
  function openSheet(dialog) {
    if (dialog.open) dialog.close();
    dialog.showModal();
  }

  document.querySelectorAll('dialog.sheet').forEach(sheet => {
    sheet.addEventListener('close', () => {
      sheet.classList.remove('closing', 'dragging');
      sheet.style.transform = sheet.style.transition = '';
    });
    // Escape animates like every other way out.
    sheet.addEventListener('cancel', event => {
      event.preventDefault();
      closeSheet(sheet);
    });

    // On phones a sheet can be dragged down to dismiss it, as its grip suggests.
    let drag = null;
    let dragged = false;
    const reset = () => {
      sheet.classList.remove('dragging');
      sheet.style.transition = 'transform .3s var(--ease)';
      sheet.style.transform = '';
      sheet.addEventListener('transitionend', () => { sheet.style.transition = ''; }, { once: true });
    };
    sheet.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || matchMedia('(min-width: 600px)').matches) return;
      if (sheet.classList.contains('closing') || event.target.closest('input, textarea, select')) return;
      // Content that scrolls keeps its own vertical gestures.
      if (event.target.closest('.rules, .crest-options')) return;
      drag = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0, v: 0, active: false };
    });
    sheet.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dy = event.clientY - drag.y;
      if (!drag.active) {
        if (dy < -8) drag = null;
        if (dy <= 8) return;
        drag.active = true;
        sheet.setPointerCapture(event.pointerId);
        sheet.classList.add('dragging');
        sheet.style.transition = 'none';
      }
      const offset = Math.max(0, dy);
      const dt = event.timeStamp - drag.t;
      if (dt > 0) drag.v = (offset - drag.dy) / dt;
      drag.dy = offset;
      drag.t = event.timeStamp;
      sheet.style.transform = `translateY(${offset}px)`;
    });
    const release = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const { active, dy, v } = drag;
      drag = null;
      if (!active) return;
      dragged = true;
      setTimeout(() => { dragged = false; });
      // A quick flick or a pull past a third of the sheet dismisses it; anything less springs back.
      if (event.type === 'pointerup' && (dy > sheet.offsetHeight / 3 || (v > 0.5 && dy > 20))) {
        sheet.classList.remove('dragging');
        sheet.style.transition = '';
        closeSheet(sheet);
      } else {
        reset();
      }
    };
    sheet.addEventListener('pointerup', release);
    sheet.addEventListener('pointercancel', release);
    // The pointer lifting after a drag isn't a tap on whatever it ended over.
    sheet.addEventListener('click', event => {
      if (dragged) {
        event.stopPropagation();
        event.preventDefault();
      }
    }, true);
  });

  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open]');
    if (opener) {
      // Moving from one sheet to another swaps them without the close animation.
      const open = document.querySelector('dialog[open]');
      if (open) open.close();
      openSheet($(opener.dataset.open));
      return;
    }
    if (event.target.closest('[data-close]')) {
      closeSheet(event.target.closest('dialog'));
      return;
    }
    // Tap on the backdrop closes a sheet. The backdrop reports the dialog as its target,
    // so check the tap really landed outside the sheet and not in its padding.
    if (event.target.tagName === 'DIALOG') {
      const r = event.target.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) closeSheet(event.target);
    }
  });

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
  let revealRun = 0;
  let presenceRef = null;
  let awayTimer = null;

  function listen(ref, callback) {
    ref.on('value', callback);
    listeners.push([ref, callback]);
  }

  function detachRoom() {
    revealRun++;
    listeners.forEach(([ref, callback]) => ref.off('value', callback));
    listeners = [];
    if (presenceRef) {
      presenceRef.onDisconnect().cancel();
      presenceRef = null;
    }
    clearTimeout(awayTimer);
    gameID = null;
    roomName = null;
    roomPass = null;
    users = {};
    presence = {};
    state = null;
    locked = false;
    document.title = 'Empire';
    resetLobby();
  }

  // Rooms live under a random Firebase key nobody types. People know a room by its name
  // (unique among open rooms) and a short password; the pair looks the key up in
  // /roomNames/{name}/{password}, which can only be read by someone who knows both.
  let roomName = null;
  let roomPass = null;

  function setRoomInUrl(name, pass) {
    const url = new URL(document.location);
    url.searchParams.delete('code');
    url.searchParams.delete('room');
    url.searchParams.delete('pass');
    if (name && pass) {
      url.searchParams.set('room', name);
      url.searchParams.set('pass', pass);
    } else if (name) {
      url.searchParams.set('code', name); // a room from before passwords
    }
    history.replaceState(null, '', url);
  }

  function roomLink() {
    const url = new URL(document.location.origin);
    if (roomPass) {
      url.searchParams.set('room', roomName);
      url.searchParams.set('pass', roomPass);
    } else {
      url.searchParams.set('code', gameID);
    }
    return url.href;
  }

  // ---------------------------------------------------------------------------
  // Create or join

  const NAME_MAX = 32; // keep in sync with database.rules.json
  // No I, L or O, so a password read off a screen can't be mistaken for 1 or 0.
  const PASS_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const roomPassInput = $('roomPass');
  const roomPassHelper = $('roomPassHelper');

  // Room names are written as lowercase words joined by dashes: "Friday Night!" → friday-night.
  function slugify(raw) {
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, NAME_MAX).replace(/-+$/, '');
  }

  function cleanPass(raw) {
    return raw.toUpperCase().replace(/[^A-Z]/g, '');
  }

  function randomPass() {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return [...bytes].map(b => PASS_LETTERS[b % PASS_LETTERS.length]).join('');
  }

  function codeError(message) {
    userGameCode.classList.add('invalid');
    userGameCodeHelper.textContent = message;
  }

  function passError(message) {
    roomPassInput.classList.add('invalid');
    roomPassHelper.textContent = message;
  }

  function clearCodeError() {
    userGameCode.classList.remove('invalid');
    userGameCodeHelper.textContent = '';
    roomPassInput.classList.remove('invalid');
    roomPassHelper.textContent = '';
  }
  userGameCode.addEventListener('input', clearCodeError);
  roomPassInput.addEventListener('input', () => {
    const at = roomPassInput.selectionStart;
    const clean = cleanPass(roomPassInput.value).slice(0, 6);
    if (clean !== roomPassInput.value) {
      roomPassInput.value = clean;
      roomPassInput.setSelectionRange(Math.min(at, clean.length), Math.min(at, clean.length));
    }
    clearCodeError();
  });

  // The create form suggests a memorable name (e.g. worried-hamster); leaving it as is takes
  // the suggestion. The password is what keeps the room private.
  let suggestedName = '';
  function suggestName() {
    suggestedName = suggestRoomName();
    if (roomMode === 'create') userGameCode.placeholder = suggestedName;
  }

  let roomMode = 'create';
  function setRoomMode(mode) {
    roomMode = mode;
    const joining = mode === 'join';
    $('roomForm').dataset.mode = mode;
    $('modeCreate').setAttribute('aria-pressed', String(!joining));
    $('modeJoin').setAttribute('aria-pressed', String(joining));
    $('passField').hidden = !joining;
    $('createHint').hidden = joining;
    $('roomSubmitLabel').textContent = joining ? 'Join' : 'Create';
    userGameCode.placeholder = joining ? 'Room name' : suggestedName;
    clearCodeError();
  }
  $('modeCreate').addEventListener('click', () => setRoomMode('create'));
  $('modeJoin').addEventListener('click', () => setRoomMode('join'));

  // Claims the name and creates the room in one write. The rules refuse it if the name is
  // already in use, so two people can never end up with the same room name.
  async function claimRoom(name) {
    const id = db.ref('games').push().key;
    const pass = randomPass();
    try {
      await db.ref().update({
        [`games/${id}`]: { state: 'waiting', createdAt: firebase.database.ServerValue.TIMESTAMP, name, pass },
        [`roomNames/${name}/${pass}`]: id
      });
      return id;
    } catch (err) {
      if (err.code !== 'PERMISSION_DENIED' && !/permission/i.test(err.message)) throw err;
      return null;
    }
  }

  let busy = false;
  async function tryCreating() {
    const typed = userGameCode.value.trim();
    const custom = slugify(typed);
    if (typed && !custom) {
      codeError('Use letters or numbers in the room name.');
      return;
    }
    await signedIn;
    let id = null;
    let name = custom || suggestedName || suggestRoomName();
    if (custom) {
      id = await claimRoom(name);
      if (!id) {
        codeError(`A room called ${name} is already open. Pick another name, or join it with its password.`);
        return;
      }
    } else {
      // The suggested name was taken in the meantime: quietly try a few more.
      for (let i = 0; i < 5 && !id; i++) {
        if (i > 0) name = suggestRoomName();
        id = await claimRoom(name);
      }
      if (!id) {
        codeError('Could not create a room. Try again.');
        return;
      }
    }
    suggestName();
    await enterRoom(id);
  }

  // Finds a room by name and password; null when nothing matches.
  async function findRoom(name, pass) {
    if (!name || pass.length !== 6) return null;
    try {
      const id = (await db.ref(`roomNames/${name}/${pass}`).once('value')).val();
      if (!id || !(await db.ref(`games/${id}/state`).once('value')).exists()) return null;
      return id;
    } catch {
      return null;
    }
  }

  async function tryJoining(rawName = userGameCode.value, rawPass = roomPassInput.value) {
    const name = slugify(rawName.trim());
    const pass = cleanPass(rawPass);
    const backHome = () => {
      setRoomMode('join');
      userGameCode.value = name;
      roomPassInput.value = pass;
      setRoomInUrl(null);
      show('home');
    };
    if (!name) {
      backHome();
      codeError('Enter the room name.');
      return;
    }
    if (pass.length !== 6) {
      backHome();
      passError('Enter the 6-letter password.');
      return;
    }
    await signedIn;
    const id = await findRoom(name, pass);
    if (!id) {
      backHome();
      passError(`No open room matches ${name} with that password.`);
      return;
    }
    await enterRoom(id);
  }

  // Links from before rooms had passwords: ?code=<room key>.
  async function joinOldLink(code) {
    await signedIn;
    const exists = code.length <= 128 && !/[.#$[\]/]/.test(code) &&
      (await db.ref(`games/${code}/state`).once('value').catch(() => null))?.exists();
    if (exists) {
      await enterRoom(code);
    } else {
      setRoomInUrl(null);
      show('home');
      toast('That room has closed.');
    }
  }

  $('roomForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    $('roomSubmit').classList.add('is-busy');
    try {
      await (roomMode === 'join' ? tryJoining() : tryCreating());
    } catch (err) {
      console.error(err);
      codeError('Something went wrong. Try again.');
    } finally {
      busy = false;
      $('roomSubmit').classList.remove('is-busy');
    }
  });

  async function enterRoom(code) {
    await signedIn;
    if (gameID && gameID !== code) {
      await leaveRoom({ goHome: false });
    }
    detachRoom();
    gameID = code;
    const [nameSnap, passSnap] = await Promise.all([
      db.ref(`games/${code}/name`).once('value'), db.ref(`games/${code}/pass`).once('value')
    ]);
    roomName = nameSnap.val() || code;
    roomPass = passSnap.val();
    document.title = `Empire: ${roomName}`;
    setRoomInUrl(roomName, roomPass);
    document.querySelectorAll('.room-name').forEach(el => { el.textContent = roomName; });
    $('roomPassText').textContent = roomPass || '';
    $('roomPassRow').hidden = !roomPass;
    $('inviteText').textContent = roomPass ? 'with this room name and password' : 'with this code';
    requestAnimationFrame(fitMarquees);

    // Reset the home form so it never points at the previous room.
    userGameCode.value = '';
    roomPassInput.value = '';
    setRoomMode('create');

    startPresence();

    const me = await db.ref(`games/${gameID}/users/${uid}`).once('value');
    users = me.exists() ? { [uid]: me.val() } : {};

    let first = true;
    listen(db.ref(`games/${gameID}/users`), snapshot => {
      const hadMe = Boolean(users[uid]);
      const previous = users;
      users = snapshot.val() || {};
      Object.entries(users).forEach(([id, user]) => { if (user.fakeBadge) botNames[id] = user.real; });
      renderLobby();

      // Only a new player entering beeps; leaving or editing a name stays silent.
      if (!first && Object.keys(users).some(id => !previous[id])) chime();
      first = false;

      // Removed by someone else (for example after being offline too long).
      if (hadMe && !users[uid] && state !== 'resetting' && state !== 'deleting') {
        toast('You were removed from the lobby. Enter your names to rejoin.');
        openSetup();
      }
    });
    listen(db.ref(`games/${gameID}/presence`), snapshot => {
      const hadPresence = Boolean(presence[uid]);
      presence = snapshot.val() || {};
      // A player removed my watching entry: leave the room.
      if (hadPresence && !presence[uid] && !users[uid] && state !== 'resetting' && state !== 'deleting') {
        toast('You were removed from the room.');
        leaveRoom();
        return;
      }
      renderLobby();
    });
    listen(db.ref(`games/${gameID}/state`), onStateChange);
    announced = new Set();
    let firstEliminated = true;
    listen(db.ref(`games/${gameID}/eliminated`), snapshot => {
      const all = snapshot.val() || {};
      Object.keys(all).forEach(key => {
        const entry = all[key];
        if (!entry || typeof entry !== 'object' || announced.has(key)) return;
        announced.add(key);
        // Only announce fresh removals, not ones that happened before this device joined.
        if (!firstEliminated || serverNow() - entry.at < 15000) announceRemoved(key, entry);
      });
      firstEliminated = false;
    });
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
    closeSheet($('optionsDialog'));
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
        await navigator.share({ title: 'Empire', text: roomPass ? `Join my Empire game: ${roomName} (password ${roomPass})` : `Join my Empire game: ${roomName}`, url: link });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast(link));
  }));

  // ---------------------------------------------------------------------------
  // Pick names

  const SECRET_MAX = 24; // keep in sync with maxlength in index.html and database.rules.json

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

  // Crest: picked in a sheet from the names screen and kept on this device for every room.
  $('crestDefs').innerHTML = crestDefs();
  let crest = localStorage.getItem('crest') ? parseCrest(localStorage.getItem('crest')) : randomCrest();
  const initialOf = name => ([...name.trim()][0] || '').toUpperCase();

  function saveCrest() {
    try { localStorage.setItem('crest', crestString(crest)); } catch (err) { /* private mode */ }
  }
  saveCrest();

  // Another player in this room already bears the same crest (with the same letter, if any).
  function crestTaken() {
    const mine = crestString(crest) + (crest.emblem === 'letter' ? initialOf(realName.value) : '');
    return Object.entries(users).some(([key, user]) => {
      if (key === uid || !user || !user.real || user.fakeBadge) return false;
      const theirs = user.crest ? parseCrest(user.crest) : defaultCrest(key);
      return crestString(theirs) + (theirs.emblem === 'letter' ? initialOf(user.real) : '') === mine;
    });
  }

  // Each group lists its choices; tiles preview the choice on your current crest.
  const crestGroups = [
    { part: 'shape', label: 'Shape', options: SHAPES },
    { part: 'color', label: 'Color', options: COLORS, swatch: true },
    { part: 'pattern', label: 'Pattern', options: PATTERNS },
    { part: 'emblem', label: 'Emblem', options: EMBLEMS }
  ];

  function crestTile(part, value, label, swatch) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = swatch ? 'crest-tile crest-swatch' : 'crest-tile';
    btn.dataset.part = part;
    btn.dataset.value = value;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    if (swatch) btn.style.setProperty('--c', swatch);
    return btn;
  }

  function buildCrestOptions() {
    const box = $('crestOptions');
    crestGroups.forEach(group => {
      const section = document.createElement('div');
      section.className = 'crest-group';
      const head = document.createElement('div');
      head.className = 'crest-group-head';
      head.innerHTML = `<span class="eyebrow">${group.label}</span>`;
      if (group.part === 'color') {
        const metals = document.createElement('div');
        metals.className = 'crest-metals';
        metals.innerHTML = '<span class="eyebrow">Trim</span>';
        Object.entries(METALS).forEach(([key, metal]) => metals.appendChild(crestTile('metal', key, `${metal.label} trim`, metal.hex)));
        head.appendChild(metals);
      }
      const grid = document.createElement('div');
      grid.className = 'crest-grid';
      grid.style.setProperty('--n', Object.keys(group.options).length);
      Object.entries(group.options).forEach(([key, option]) => grid.appendChild(crestTile(group.part, key, option.label, group.swatch && option.hex)));
      section.append(head, grid);
      box.appendChild(section);
    });
    box.addEventListener('click', event => {
      const tile = event.target.closest('.crest-tile');
      if (!tile) return;
      crest[tile.dataset.part] = tile.dataset.value;
      saveCrest();
      renderCrest();
    });
  }
  buildCrestOptions();

  function renderCrest() {
    const letter = initialOf(realName.value) || '?';
    $('crestPreview').innerHTML = crestSvg(crest, { letter });
    if (!$('crestDialog').open) return;
    $('crestBig').innerHTML = crestSvg(crest, { letter });
    const taken = crestTaken();
    $('crestNote').classList.toggle('taken', taken);
    $('crestNote').textContent = taken ? 'Someone in this room already bears this crest. Change a part to stand apart.' : 'Your mark at the table. Tap to change any part.';
    document.querySelectorAll('#crestOptions .crest-tile').forEach(tile => {
      const { part, value } = tile.dataset;
      tile.setAttribute('aria-pressed', String(crest[part] === value));
      if (part === 'color' || part === 'metal') return;
      // Patterns are shown without the emblem so the division is easy to see.
      const preview = { ...crest, [part]: value, ...(part === 'pattern' ? { emblem: 'letter' } : {}) };
      tile.innerHTML = crestSvg(preview, { letter: part === 'pattern' ? '' : letter });
    });
  }

  $('crestButton').addEventListener('click', () => {
    openSheet($('crestDialog'));
    renderCrest();
  });
  $('crestShuffle').addEventListener('click', () => {
    const emblems = Object.keys(EMBLEMS);
    crest = { ...randomCrest(), emblem: emblems[Math.floor(Math.random() * emblems.length)] };
    saveCrest();
    renderCrest();
  });
  realName.addEventListener('input', renderCrest);
  renderCrest();

  function openSetup() {
    $('submitLabel').textContent = users[uid] ? 'Save names' : 'Enter the lobby';
    renderCrest();
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

    const code = gameID;
    if (state === 'resetting') {
      toast('The new round is getting ready. Try again in a moment.');
      return;
    }
    if (locked || state !== 'waiting') {
      toast('Names are locked until the next round.');
      return;
    }
    // A submission racing Start either commits before the roster freezes or is rejected.
    try {
      await db.ref(`games/${code}`).update({
        [`users/${uid}/real`]: userRealName,
        [`users/${uid}/clan`]: userRealName,
        [`secrets/${uid}`]: userFakeName
      });
    } catch (err) {
      toast('Could not save your names. The round may have started; try again next round.');
      return;
    }
    if (gameID !== code) return;
    localStorage.setItem('realName', userRealName);
    sessionStorage.setItem(`secret:${code}`, userFakeName);
    // Written on its own so a database without crest support still accepts the names.
    db.ref(`games/${gameID}/users/${uid}/crest`).set(crestString(crest)).catch(() => {});

    show('lobby');
  });

  $('editNames').addEventListener('click', () => {
    closeSheet($('optionsDialog'));
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
      crest: bot ? botCrest(key) : user.crest ? parseCrest(user.crest) : defaultCrest(key),
      removable: !you && (bot || (offline && Date.now() - seen.lastSeen > OFFLINE_KICK_MS))
    };
  }

  function removePlayer(key, onFail) {
    const update = {
      [`users/${key}`]: null,
      [`secrets/${key}`]: null
    };
    // A bot that took part in the round has its secret name announced when it is removed.
    const flagged = locked && users[key] && users[key].fakeBadge;
    if (flagged) update[`eliminated/${key}`] = true;
    const room = db.ref(`games/${gameID}`);
    // If the flag is refused (rules not updated yet), still remove the bot without announcing it.
    room.update(update).catch(err => {
      if (!flagged) throw err;
      delete update[`eliminated/${key}`];
      return room.update(update);
    }).catch(() => {
      toast('Could not remove that player');
      if (onFail) onFail();
    });
  }

  function avatarHtml() {
    return '<span class="avatar"><span class="crest-slot"></span><span class="initial"></span><svg class="icon bot-icon"><use href="#i-bot" /></svg><span class="dot"></span></span>';
  }

  function paintAvatar(avatar, p, size) {
    avatar.style.background = p.crest ? '' : p.color;
    avatar.classList.toggle('has-crest', Boolean(p.crest));
    const slot = avatar.querySelector('.crest-slot');
    const drawn = p.crest ? [crestString(p.crest), p.name, p.you].join('|') : '';
    if (slot.dataset.drawn !== drawn) {
      slot.dataset.drawn = drawn;
      slot.innerHTML = p.crest ? crestSvg(p.crest, { letter: initialOf(p.name), ring: p.you }) : '';
    }
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
      const key = btn.dataset.key;
      // Once the round has started, removing a bot reveals its secret name, so ask first.
      if (locked && users[key] && users[key].fakeBadge) {
        pendingBotRemoval = key;
        $('removeBotName').textContent = users[key].real;
        openSheet($('confirmRemoveBot'));
        return;
      }
      btn.disabled = true;
      removePlayer(key, () => { btn.disabled = false; });
    });
    return btn;
  }

  let pendingBotRemoval = null;
  $('removeBotButton').addEventListener('click', () => {
    if (pendingBotRemoval && users[pendingBotRemoval]) removePlayer(pendingBotRemoval);
    pendingBotRemoval = null;
  });
  $('confirmRemoveBot').addEventListener('close', () => { pendingBotRemoval = null; });

  let lastCenter = null;
  document.fonts.ready.then(() => { centerFit = ''; if (lastCenter) fitCenter(...lastCenter); });

  // The stage is scaled to the table's width: down on narrow phones, up on big screens.
  function fitTable() {
    const width = $('tableView').clientWidth;
    if (width > 0) $('tableInner').style.transform = `scale(${width / 390})`;
    if (width > 0 && lastCenter) fitCenter(...lastCenter);
  }
  new ResizeObserver(fitTable).observe($('tableView'));

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
      .map(([key, seen]) => ({ key, name: key === uid ? 'You' : seen.name || 'Guest' }));
    $('watching').hidden = watchers.length === 0;
    const chips = $('watchingNames');
    chips.replaceChildren(...watchers.map(({ key, name }) => {
      const chip = document.createElement('span');
      chip.className = 'watch-chip';
      chip.textContent = name;
      if (!spectator && key !== uid) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'watch-remove';
        btn.setAttribute('aria-label', `Remove ${name}`);
        btn.textContent = '×';
        btn.addEventListener('click', () => {
          btn.disabled = true;
          db.ref(`games/${gameID}/presence/${key}`).remove().catch(() => {
            toast('Could not remove that watcher');
            btn.disabled = false;
          });
        });
        chip.append(btn);
      }
      return chip;
    }));
    $('lockNote').hidden = !spectator && !locked;
    $('lockText').textContent = spectator
      ? 'Names are set for this round. You can watch and join at the next round.'
      : 'Names are set for this round. New players can watch and join next round.';
    $('generateName').hidden = spectator;
    document.querySelectorAll('[data-open="confirmNewGame"], [data-open="confirmDelete"]').forEach(button => { button.hidden = spectator; });
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
    startButton.classList.toggle('is-disabled', (!locked && count < 2) || revealing || preparing);
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
      // Names sit on the outer side of each seat so they never cover the center.
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

  // Switching views morphs each player from one layout to the other: copies of their
  // avatar and name swing along curved paths, swelling a little mid-flight, while the
  // real ones wait hidden in their new places.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MORPH_MS = 720;
  const MORPH_STAGGER = 22;
  let morph = null;

  function bezier(x1, y1, x2, y2) {
    const at = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
    return t => {
      let u = t;
      for (let i = 0; i < 8; i++) {
        const slope = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
        if (Math.abs(slope) < 1e-6) break;
        u = Math.min(1, Math.max(0, u - (at(u, x1, x2) - t) / slope));
      }
      return at(u, y1, y2);
    };
  }
  // Horizontal motion leads and vertical motion trails, which bends each path into an arc.
  const easeX = bezier(.15, .75, .3, 1);
  const easeY = bezier(.7, 0, .35, 1);
  const easeSize = bezier(.45, 0, .2, 1);

  function textRect(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    return rect.width ? rect : el.getBoundingClientRect();
  }

  // Where each player's avatar and name sit in a view, skipping rows scrolled out of sight.
  function snapshot(v) {
    const shot = new Map();
    const box = v === 'list' ? $('nameList').getBoundingClientRect() : null;
    (v === 'table' ? seatEls : rowEls).forEach((entry, key) => {
      if (entry.leaving) return;
      const avRect = entry.avatar.getBoundingClientRect();
      if (!avRect.width || (box && (avRect.bottom < box.top || avRect.top > box.bottom))) return;
      const name = v === 'table' ? entry.label : entry.el.querySelector('.row-name');
      shot.set(key, { entry, avatar: entry.avatar, avRect, name, nameRect: textRect(name), dim: entry.el.classList.contains('dim') });
    });
    return shot;
  }

  function flightFrames(dx, dy, s0, s1, swell) {
    const frames = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const scale = (s0 + (s1 - s0) * easeSize(t)) * (1 + swell * Math.sin(Math.PI * t));
      frames.push({ transform: `translate(${dx * (1 - easeX(t))}px, ${dy * (1 - easeY(t))}px) scale(${scale})` });
    }
    return frames;
  }

  // The table's ring and center, left behind as a copy that dissolves outward.
  function tableGhost() {
    const table = $('tableView');
    const rect = table.getBoundingClientRect();
    const ghost = table.cloneNode(true);
    ghost.querySelector('#seats').remove();
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, animation: 'none' });
    return ghost;
  }

  function morphViews(from, to, before, ghost) {
    const after = snapshot(to);
    const layer = document.createElement('div');
    layer.className = 'morph-layer';
    document.body.appendChild(layer);
    const anims = [];
    const hidden = [];
    const run = (el, frames, options) => anims.push(el.animate(frames, { fill: 'backwards', ...options }));
    const glide = 'cubic-bezier(.45, 0, .2, 1)';
    const spring = 'cubic-bezier(.3, 1.4, .5, 1)';
    let last = 0;

    order.forEach((key, i) => {
      const a = before.get(key), b = after.get(key);
      if (!b) return;
      const delay = i * MORPH_STAGGER;
      last = delay;
      if (to === 'table') run(b.entry.x, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: delay + MORPH_MS });
      if (to === 'list') {
        // The row's card grows out from behind the landing avatar.
        const r = b.entry.el.getBoundingClientRect(), av = b.avRect;
        const start = `inset(${av.top - r.top}px ${r.right - av.right}px ${r.bottom - av.bottom}px ${av.left - r.left}px round ${av.width / 2}px)`;
        run(b.entry.el, [{ clipPath: start }, { clipPath: 'inset(0px 0px 0px 0px round 16px)' }], { duration: 560, delay: delay + 160, easing: glide });
      }
      if (!a) {
        run(b.avatar, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: delay + 300, easing: spring });
        return;
      }

      const size = b.avatar.offsetWidth;
      const avatar = b.avatar.cloneNode(true);
      Object.assign(avatar.style, {
        position: 'fixed', left: `${b.avRect.left + b.avRect.width / 2 - size / 2}px`, top: `${b.avRect.top + b.avRect.height / 2 - size / 2}px`,
        width: `${size}px`, height: `${size}px`, fontSize: getComputedStyle(b.avatar).fontSize, opacity: b.dim ? .55 : 1
      });
      layer.appendChild(avatar);
      const dx = a.avRect.left + a.avRect.width / 2 - (b.avRect.left + b.avRect.width / 2);
      const dy = a.avRect.top + a.avRect.height / 2 - (b.avRect.top + b.avRect.height / 2);
      run(avatar, flightFrames(dx, dy, a.avRect.width / size, b.avRect.width / size, .24), { duration: MORPH_MS, delay, fill: 'both' });

      const name = document.createElement('span');
      name.textContent = b.name.textContent;
      const cs = getComputedStyle(b.name);
      ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'color', 'backgroundImage', 'backgroundClip', 'webkitBackgroundClip']
        .forEach(prop => { name.style[prop] = cs[prop]; });
      Object.assign(name.style, { position: 'fixed', left: `${b.nameRect.left}px`, top: `${b.nameRect.top}px`, lineHeight: 'normal', whiteSpace: 'nowrap', transformOrigin: '0 0', opacity: b.dim ? .55 : 1 });
      layer.appendChild(name);
      const h = name.offsetHeight || 1;
      run(name, flightFrames(a.nameRect.left - b.nameRect.left, a.nameRect.top - b.nameRect.top, a.nameRect.height / h, b.nameRect.height / h, .1), { duration: MORPH_MS, delay, fill: 'both' });

      [b.avatar, b.name].forEach(el => { el.style.visibility = 'hidden'; hidden.push(el); });
    });

    if (to === 'table') {
      run($('tableCenter'), [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 140, easing: spring });
      [...$('ringGuides').children].forEach(g => run(g, [{ opacity: 0, transform: 'scale(1.35)' }, { opacity: g.style.opacity || 1, transform: 'none' }], { duration: 600, easing: glide }));
    } else {
      layer.prepend(ghost);
      ghost.querySelectorAll('.ring-guide').forEach(g => run(g, [{ transform: 'none' }, { opacity: 0, transform: 'scale(1.35)' }], { duration: 450, easing: glide, fill: 'forwards' }));
      const center = ghost.querySelector('.table-center');
      if (center) run(center, [{ transform: 'none' }, { opacity: 0, transform: 'scale(.4)' }], { duration: 380, easing: glide, fill: 'forwards' });
      run($('listSummary'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 120, easing: glide });
    }

    const finish = () => {
      clearTimeout(timer);
      anims.forEach(anim => anim.cancel());
      hidden.forEach(el => { el.style.visibility = ''; });
      layer.remove();
      morph = null;
    };
    const timer = setTimeout(finish, last + MORPH_MS + 260);
    morph = { finish };
  }

  function setView(next) {
    if (morph) morph.finish();
    const from = view;
    const animate = next !== from && !reduceMotion.matches && !$('lobbyScreen').hidden;
    const before = animate ? snapshot(from) : null;
    const ghost = animate && from === 'table' ? tableGhost() : null;
    // The views' own fade-in would shift the landing spots, so it only plays without the morph.
    document.querySelector('.lobby-body').classList.toggle('morphing', animate);
    view = next;
    try { localStorage.setItem('lobbyView', view); } catch (err) { /* private mode */ }
    const toggle = $('viewToggle');
    toggle.classList.toggle('is-list', view === 'list');
    toggle.setAttribute('aria-label', view === 'list' ? 'List view. Show the table' : 'Table view. Show the list');
    $('tableView').hidden = view !== 'table';
    $('listView').hidden = view !== 'list';
    $('listSummary').hidden = view !== 'list';
    if (view === 'table') fitTable();
    if (animate) morphViews(from, view, before, ghost);
  }
  $('viewToggle').addEventListener('click', () => setView(view === 'table' ? 'list' : 'table'));
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

  async function requestRoomState(next) {
    if (!gameID || !users[uid]) return;
    try {
      await db.ref(`games/${gameID}/state`).set(next);
    } catch (err) {
      toast('Could not change the room. Try again.');
    }
  }
  $('roomResetButton').addEventListener('click', () => requestRoomState('resetting'));
  $('roomDeleteButton').addEventListener('click', () => requestRoomState('deleting'));

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
    if (previous === 'playing' && state !== 'playing') revealRun++;
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
      const [name, pass] = [roomName, roomPass];
      detachRoom();
      // The room's name is freed in the same write, so it can be used again right away.
      const gone = { [`games/${code}`]: null };
      if (pass) gone[`roomNames/${name}/${pass}`] = null;
      await db.ref().update(gone).catch(() => {});
      sessionStorage.removeItem(`secret:${code}`);
      window.location.replace('/');
    }
    if (state === 'resetting' && previous !== 'resetting') {
      // Forget membership before the server's roster/state callbacks arrive in either order.
      users = {};
      setSecret('');
      sessionStorage.removeItem(`secret:${code}`);
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      $('submitLabel').textContent = 'Enter the lobby';
      show('setup');
      // The server clears the old roster and opens the next round.
    }
  }

  // ---------------------------------------------------------------------------
  // Countdown + reveal: nothing on screen but the name and its sliding timer.

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Long names shrink from their styled size to stay on one line; only very long ones wrap.
  function fitWord(word, box) {
    const room = box.clientWidth - 56;
    let size = Math.round(parseFloat(getComputedStyle(word).fontSize) / 4) * 4;
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

  function showStep(stage, timer, bar, step, into, names) {
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
  }

  // A removed bot's secret name, shown full screen and spoken. Announcements queue up.
  let announced = new Set();
  let announceQueue = Promise.resolve();
  // Bots' names outlive their removal, so the announcement can say who it was.
  let botNames = {};
  function announceRemoved(key, entry) {
    const code = gameID;
    const botName = botNames[key];
    announceQueue = announceQueue.then(async () => {
      if (gameID !== code) return;
      while (revealing) await sleep(300);
      const screen = $('eliminatedScreen');
      const word = $('eliminatedName');
      $('eliminatedCrest').innerHTML = crestSvg(botCrest(key));
      $('eliminatedWho').textContent = botName ? `Bot · ${botName}` : 'Bot';
      $('eliminatedLabel').textContent = 'was secretly';
      word.textContent = entry.name;
      word.style.fontSize = '';
      word.classList.remove('wrap');
      screen.hidden = false;
      fitWord(word, screen);
      speak(entry.name, entry.voice);
      await sleep(3200);
      screen.hidden = true;
    }).catch(() => { $('eliminatedScreen').hidden = true; });
  }

  async function displaySecrets() {
    if (revealing) return;
    revealing = true;
    const run = ++revealRun;
    const code = gameID;
    const [namesSnap, startSnap, replaySnap] = await Promise.all([
      db.ref(`games/${code}/names`).once('value'),
      db.ref(`games/${code}/startedAt`).once('value'),
      db.ref(`games/${code}/replay`).once('value')
    ]);
    const canonical = namesSnap.val() || [];
    const replay = replaySnap.val();
    const indexes = replay ? Object.values(replay.indexes || {}) : canonical.map((name, i) => i);
    const names = indexes.map(i => canonical[i]);
    const startedAt = startSnap.val() || serverNow();
    const countdown = 3 * COUNTDOWN_MS;
    const total = countdown + names.length * NAME_MS;
    const stillHere = () => gameID === code && state === 'playing' && run === revealRun;

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
    let spoken = -1;
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
        showStep(stage, timer, bar, step, t - stepStart, names);
      }
      // Each name is spoken as it appears.
      const spokenT = t - countdown;
      if (spokenT >= 0) {
        const i = Math.floor(spokenT / NAME_MS);
        if (i !== spoken && i < names.length) {
          spoken = i;
          if (spokenT - i * NAME_MS < 800) speak(names[i], clips[indexes[i]]);
        }
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
      db.ref(`games/${code}/state`).set('waiting').catch(() => {});
    }
    renderLobby();
    if (gameID && state === 'playing' && run !== revealRun) displaySecrets();
  }

  // ---------------------------------------------------------------------------
  // Open the room from a game link (a reload keeps the room in the address bar).

  suggestName();
  const params = (new URL(document.location)).searchParams;
  if (params.get('room')) {
    tryJoining(params.get('room'), params.get('pass') || '');
  } else if (params.get('code')) {
    joinOldLink(params.get('code'));
  } else {
    show('home');
  }
});
