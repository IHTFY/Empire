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
    if (name === 'lobby') requestAnimationFrame(() => { fitTable(); renderLobby(); });
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

  const soundOn = () => localStorage.getItem('mute') === 'volume_up';
  function renderSound() {
    document.querySelectorAll('.sound-toggle').forEach(btn => {
      btn.setAttribute('aria-pressed', String(soundOn()));
      btn.querySelector('use').setAttribute('href', soundOn() ? '#i-sound-on' : '#i-sound-off');
      const label = btn.querySelector('.sound-label');
      if (label) label.textContent = `Read names aloud: ${soundOn() ? 'on' : 'off'}`;
      else btn.setAttribute('aria-label', soundOn() ? 'Sound on' : 'Sound off');
    });
  }
  if (!localStorage.getItem('mute')) localStorage.setItem('mute', 'volume_off');
  document.querySelectorAll('.sound-toggle').forEach(btn => btn.addEventListener('click', () => {
    localStorage.setItem('mute', soundOn() ? 'volume_off' : 'volume_up');
    renderSound();
  }));
  renderSound();

  // ---------------------------------------------------------------------------
  // Current room. Everything room-specific is attached in enterRoom() and torn
  // down in detachRoom(), so switching rooms never leaves the old room on screen.

  let gameID = null;
  let listeners = [];
  let users = {};
  let presence = {};
  let state = null;
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

  // A readable random room code, e.g. velvet-comet-42.
  async function randomCode() {
    const words = await wordList();
    for (let i = 0; i < 5; i++) {
      const code = `${pickRandom(words)}-${pickRandom(words)}-${Math.floor(Math.random() * 90) + 10}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
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
    await db.ref(`games/${newCode}`).set({ state: 'waiting' });
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

      if (!first && soundOn()) {
        $('boop').load();
        $('boop').play().catch(() => {});
      }
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

    if (users[uid]) {
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
      await ref.set({ online: true, away: document.hidden, lastSeen: firebase.database.ServerValue.TIMESTAMP });
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
    const userFakeName = sanitizeName(secretName.value).slice(0, 100);
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

    // The player entry is public; the secret name is stored where only the server can read it.
    await db.ref(`games/${gameID}`).update({
      [`users/${uid}`]: { real: userRealName, clan: userRealName },
      [`secrets/${uid}`]: userFakeName
    });

    show('lobby');
  });

  $('editNames').addEventListener('click', () => {
    $('optionsDialog').close();
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

  function removePlayer(key) {
    db.ref(`games/${gameID}`).update({
      [`users/${key}`]: null,
      [`secrets/${key}`]: null
    }).catch(() => toast('Could not remove that player'));
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
    btn.addEventListener('click', () => removePlayer(btn.dataset.key));
    return btn;
  }

  function fitTable() {
    const width = $('tableView').clientWidth;
    if (width > 0) $('tableInner').style.transform = `scale(${Math.min(1, width / 390)})`;
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

    $('playerCount').textContent = count;
    $('waitingText').textContent = waitingText;
    $('listSummary').textContent = `${count} player${count === 1 ? '' : 's'} · ${waitingText.toLowerCase()}`;
    startButton.classList.toggle('is-disabled', count < 2 || revealing);
    $('generateName').disabled = count >= MAX_PLAYERS;

    renderTable(players);
    renderList(players);
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
    center.querySelector('.tc-room').style.fontSize = `${L.room}px`;
    center.querySelector('.tc-count').style.fontSize = `${L.num}px`;
    center.querySelector('.tc-unit').style.fontSize = `${L.unit}px`;
    const wait = center.querySelector('.tc-wait');
    wait.style.fontSize = `${L.wait}px`;
    wait.style.maxWidth = `${Math.round(L.disc * 1.55)}px`;

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

  function renderList(players) {
    const list = $('nameList');
    const live = new Set(players.map(p => p.key));
    rowEls.forEach((entry, key) => {
      if (live.has(key) || entry.leaving) return;
      entry.leaving = true;
      entry.el.classList.add('gone');
      setTimeout(() => { entry.el.remove(); rowEls.delete(key); }, 420);
    });
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
      if (list.children[i] !== entry.el) list.insertBefore(entry.el, list.children[i] || null);
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
  }

  function setView(next) {
    view = next;
    try { localStorage.setItem('lobbyView', view); } catch (err) { /* private mode */ }
    document.querySelector('.seg').classList.toggle('list', view === 'list');
    document.querySelectorAll('.seg-btn').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.view === view)));
    $('tableView').hidden = view !== 'table';
    $('listView').hidden = view !== 'list';
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

  async function displaySecrets() {
    if (revealing) return;
    revealing = true;
    const code = gameID;
    const reveal = $('revealScreen');
    const stage = $('revealStage');
    const timer = $('revealTimer');
    const bar = $('revealBar');
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    reveal.hidden = false;
    timer.hidden = true;
    stage.innerHTML = '';

    const snapshot = await db.ref(`games/${code}/names`).once('value');
    const names = snapshot.val() || [];
    const stillHere = () => gameID === code;

    for (let n = 3; n >= 1 && stillHere(); n--) {
      stage.innerHTML = `<div class="count"><span class="count-burst"></span><span class="count-num display">${n}</span></div>`;
      await sleep(COUNTDOWN_MS);
    }

    let utterance = new SpeechSynthesisUtterance();
    bar.style.setProperty('--t', `${NAME_MS}ms`);
    for (const name of names) {
      if (!stillHere()) break;
      const word = document.createElement('div');
      word.className = 'reveal-name display';
      word.textContent = name;
      stage.replaceChildren(word);
      fitWord(word, stage);
      timer.hidden = false;
      bar.classList.remove('run');
      void bar.offsetWidth; // restart the timer animation
      bar.classList.add('run');
      if (soundOn()) {
        utterance.text = name;
        speechSynthesis.speak(utterance);
      }
      await sleep(NAME_MS);
    }

    revealing = false;
    reveal.hidden = true;
    stage.innerHTML = '';
    bar.classList.remove('run');
    if (stillHere() && state === 'playing') {
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
