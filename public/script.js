document.addEventListener('DOMContentLoaded', async () => {
  // NOTE ON for development. OFF for deployment.
  // firebase.functions().useFunctionsEmulator('http://localhost:5001');

  const OFFLINE_KICK_MS = 10 * 60 * 1000;
  const AWAY_AFTER_MS = 2 * 60 * 1000;
  const colors = ['red', 'pink', 'purple', 'deep-purple', 'indigo', 'blue', 'light-blue', 'cyan', 'teal', 'green', 'light-green', 'lime', 'yellow', 'amber', 'orange', 'deep-orange', 'brown', 'grey', 'blue-grey'];

  let uid = null;

  const userGameCode = document.getElementById('userGameCode');
  const userGameCodeHelper = document.getElementById('userGameCodeHelper');
  const realName = document.getElementById('realName');
  const realNameHelper = document.getElementById('realNameHelper');
  const secretName = document.getElementById('secretName');
  const secretNameHelper = document.getElementById('secretNameHelper');
  const startButton = document.getElementById('revealSecrets');

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
          document.getElementById('realNameLabel').classList.add('active');
        }
        resolve();
      }
    });
  });

  // Start the database instance
  const db = firebase.database();

  M.AutoInit();

  const tabs = M.Tabs.getInstance(document.querySelector('.tabs'));

  const volumeIcon = document.getElementById('volumeIcon');
  if (!localStorage.getItem('mute')) {
    localStorage.mute = 'volume_off';
  }
  volumeIcon.textContent = localStorage.getItem('mute');

  volumeIcon.addEventListener('click', () => {
    localStorage.setItem('mute', localStorage.getItem('mute') === 'volume_off' ? 'volume_up' : 'volume_off');
    volumeIcon.textContent = localStorage.getItem('mute');
  });

  const flashNames = firebase.functions().httpsCallable('flashNames');

  // toggle password visibility
  const togglePassword = document.getElementById('togglePassword');
  togglePassword.addEventListener('click', () => {
    if (secretName.type === 'password') {
      secretName.type = 'text';
      togglePassword.textContent = 'visibility';
    } else {
      secretName.type = 'password';
      togglePassword.textContent = 'visibility_off';
    }
  });

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
    document.getElementById('gameLink').innerHTML = '';
    document.getElementById('nameList').innerHTML = '';
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
  // Screens

  function showCreate() {
    document.getElementById('setupTab').classList.add('disabled');
    document.getElementById('setupPage').classList.add('hide');
    document.getElementById('playTab').classList.add('disabled');
    document.getElementById('playPage').classList.add('hide');
    tabs.select('createPage');
  }

  function showSetup() {
    document.getElementById('setupTab').classList.remove('disabled');
    document.getElementById('setupPage').classList.remove('hide');
    document.getElementById('playTab').classList.toggle('disabled', !users[uid]);
    tabs.select('setupPage');
  }

  function showLobby() {
    document.getElementById('setupTab').classList.remove('disabled');
    document.getElementById('setupPage').classList.remove('hide');
    document.getElementById('playTab').classList.remove('disabled');
    document.getElementById('playPage').classList.remove('hide');
    tabs.select('playPage');
  }

  // ---------------------------------------------------------------------------
  // Create or join

  function validCode(code) {
    return code.length <= 128 && !/[.#$[\]/]/.test(code);
  }

  function codeError(message) {
    userGameCode.classList.remove('valid');
    userGameCode.classList.add('invalid');
    userGameCodeHelper.setAttribute('data-error', message);
  }

  async function doesGameExist(code) {
    if (code === '') return false;
    let snapshot = await db.ref(`games/${code}/state`).once('value');
    return snapshot.exists();
  }

  async function tryCreating() {
    const code = userGameCode.value.trim();
    if (!validCode(code)) {
      codeError('Game codes can\'t contain . # $ [ ] or /');
      return;
    }
    if (await doesGameExist(code)) {
      codeError(`${code} already exists. Join or choose a new Game Code.`);
      return;
    }
    const newCode = code || db.ref('games').push().key;
    await db.ref(`games/${newCode}`).set({ state: 'waiting' });
    await enterRoom(newCode);
  }

  async function tryJoining(code = userGameCode.value.trim()) {
    if (!validCode(code) || !await doesGameExist(code)) {
      userGameCode.value = code;
      document.getElementById('userGameCodeLabel').classList.add('active');
      codeError(`${code} doesn't exist. Check the code or create a new game with this code.`);
      setRoomInUrl(null);
      return;
    }
    await enterRoom(code);
  }

  document.getElementById('createButton').addEventListener('click', tryCreating);
  document.getElementById('joinButton').addEventListener('click', () => tryJoining());

  async function enterRoom(code) {
    await signedIn;
    if (gameID && gameID !== code) {
      await leaveRoom({ goHome: false });
    }
    detachRoom();
    gameID = code;
    document.title = `Empire: ${gameID}`;
    setRoomInUrl(gameID);

    // Reset the create form so it never points at the previous room.
    userGameCode.value = '';
    userGameCode.classList.remove('valid', 'invalid');
    userGameCodeHelper.removeAttribute('data-error');
    M.updateTextFields();

    renderShareButton();
    startPresence();

    const me = await db.ref(`games/${gameID}/users/${uid}`).once('value');
    users = me.exists() ? { [uid]: me.val() } : {};

    let first = true;
    listen(db.ref(`games/${gameID}/users`), snapshot => {
      const hadMe = Boolean(users[uid]);
      users = snapshot.val() || {};
      renderLobby();

      if (!first && localStorage.getItem('mute') === 'volume_up') {
        document.getElementById('boop').load();
        document.getElementById('boop').play();
      }
      first = false;

      // Removed by someone else (for example after being offline too long).
      if (hadMe && !users[uid] && state !== 'resetting' && state !== 'deleting') {
        M.toast({ html: 'You were removed from the lobby. Enter your names to rejoin.' });
        showSetup();
      }
    });
    listen(db.ref(`games/${gameID}/presence`), snapshot => {
      presence = snapshot.val() || {};
      renderLobby();
    });
    listen(db.ref(`games/${gameID}/state`), onStateChange);

    if (users[uid]) {
      realName.value = users[uid].real;
      secretName.value = sessionStorage.getItem(`secret:${gameID}`) || '';
      M.updateTextFields();
      showLobby();
    } else {
      showSetup();
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
      showCreate();
    }
  }

  document.getElementById('leaveRoom').addEventListener('click', () => leaveRoom());

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

  function renderShareButton() {
    const canShare = typeof navigator.share === 'function';

    let shareLink = document.createElement('button');
    shareLink.textContent = canShare ? 'Share Game Link' : 'Get Game Link';
    shareLink.classList.add('waves-effect', 'waves-light', 'btn-flat', 'btn-large');
    shareLink.addEventListener('click', async () => {
      const link = roomLink();
      if (canShare) {
        try {
          await navigator.share({ title: 'Empire', text: `Join my Empire game: ${gameID}`, url: link });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      navigator.clipboard.writeText(link).then(() => {
        M.toast({ html: 'Link Copied' });
      }, () => {
        M.toast({ html: 'Error' });
      });
    });

    let shareIcon = document.createElement('i');
    shareIcon.classList.add('material-icons', 'left');
    shareIcon.textContent = canShare ? 'share' : 'person_add';
    shareLink.appendChild(shareIcon);

    document.getElementById('gameLink').innerHTML = '';
    document.getElementById('gameLink').appendChild(shareLink);
  }

  // ---------------------------------------------------------------------------
  // Pick names

  function sanitizeName(raw) {
    //TODO different rules for allowed characters etc.
    return raw.toLowerCase().replace(/[^ A-Za-z0-9]/g, '').replace(/\s+/g, ' ').trim();
  }

  document.getElementById('submitNames').addEventListener('click', async () => {
    if (!gameID) return;
    realName.className = 'validate';
    secretName.className = 'validate';

    const userRealName = realName.value.trim().slice(0, 100);
    const userFakeName = sanitizeName(secretName.value).slice(0, 100);
    let ok = true;

    const taken = Object.entries(users).some(([key, user]) =>
      key !== uid && user.real && user.real.toLowerCase() === userRealName.toLowerCase());
    if (userRealName === '') {
      realName.classList.add('invalid');
      realNameHelper.setAttribute('data-error', 'Invalid Real Name');
      ok = false;
    } else if (taken) {
      realName.classList.add('invalid');
      realNameHelper.setAttribute('data-error', 'Someone in this room already uses that name');
      ok = false;
    } else {
      realName.classList.add('valid');
    }

    if (userFakeName === '') {
      secretName.classList.add('invalid');
      secretNameHelper.setAttribute('data-error', 'Invalid Secret Name');
      ok = false;
    } else {
      secretName.classList.add('valid');
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

    showLobby();
  });

  document.getElementById('editNames').addEventListener('click', () => {
    if (users[uid]) {
      realName.value = users[uid].real;
    }
    secretName.value = sessionStorage.getItem(`secret:${gameID}`) || '';
    M.updateTextFields();
    showSetup();
  });

  // ---------------------------------------------------------------------------
  // Lobby

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

  document.getElementById('generateName').addEventListener('click', async () => {
    if (!gameID) return;
    if (fakeNameList.length === 0) {
      fakeNameList = await populateList('names.txt');
      fakeSecretList = await populateList('words.txt');
    }
    const fakeName = pickRandom(fakeNameList);
    const fakeSecret = pickRandom(fakeSecretList);
    const fakeID = db.ref(`games/${gameID}/users`).push().key;

    // add the fake player and their secret together
    await db.ref(`games/${gameID}`).update({
      [`users/${fakeID}`]: { game: gameID, real: fakeName, clan: fakeName, fakeBadge: true },
      [`secrets/${fakeID}`]: fakeSecret
    });
  });

  function removePlayer(key) {
    db.ref(`games/${gameID}`).update({
      [`users/${key}`]: null,
      [`secrets/${key}`]: null
    }).catch(() => M.toast({ html: 'Could not remove that player' }));
  }

  function minutesAgo(time) {
    const minutes = Math.floor((Date.now() - time) / 60000);
    return minutes < 1 ? 'just now' : `${minutes}m ago`;
  }

  function renderLobby() {
    if (!gameID) return;
    const nameList = document.getElementById('nameList');
    const entries = Object.entries(users).filter(([, user]) => user && user.real);
    const count = entries.length;
    nameList.innerHTML = '';

    const header = document.createElement('li');
    header.classList.add('collection-header', 'center-align');
    const title = document.createElement('h5');
    title.textContent = `${gameID} Lobby`;
    const subtitle = document.createElement('p');
    subtitle.classList.add('grey-text');
    const waitingOn = entries
      .filter(([key, user]) => !user.fakeBadge && presence[key] && (!presence[key].online || presence[key].away))
      .map(([, user]) => user.real);
    subtitle.textContent = `${count} player${count === 1 ? '' : 's'}` +
      (count < 2 ? ' · need at least 2 to start' : '') +
      (waitingOn.length ? ` · waiting for ${waitingOn.join(', ')}` : '');
    header.appendChild(title);
    header.appendChild(subtitle);
    nameList.appendChild(header);

    for (let [key, user] of entries) {
      let item = document.createElement('li');
      item.classList.add('collection-item', 'avatar');

      const hashedName = [...key, ...user.real].sort().reduce((a, c) => a + c.charCodeAt(0), 0);
      const color = colors[hashedName % colors.length];

      const pfp = document.createElement('i');
      pfp.classList.add('material-icons', 'circle', color);
      pfp.textContent = 'person';

      const txt = document.createElement('h6');
      txt.textContent = user.real;

      const status = document.createElement('span');
      status.classList.add('grey-text', 'status');
      const seen = presence[key];
      let removable = false;

      if (user.fakeBadge) {
        const b = document.createElement('span');
        b.classList.add('new', 'badge', 'indigo', 'darken-3');
        b.setAttribute('data-badge-caption', 'FAKE');
        pfp.textContent = 'adb';
        txt.appendChild(b);
        removable = true;
      } else if (seen && seen.online === false) {
        item.classList.add('offline');
        status.textContent = `offline · ${minutesAgo(seen.lastSeen)}`;
        removable = Date.now() - seen.lastSeen > OFFLINE_KICK_MS;
      } else if (seen && seen.away) {
        item.classList.add('away');
        status.textContent = 'away';
      }
      if (key === uid) {
        status.textContent = status.textContent ? `you · ${status.textContent}` : 'you';
      }

      item.appendChild(pfp);
      item.appendChild(txt);
      item.appendChild(status);

      if (removable && key !== uid) {
        const remove = document.createElement('a');
        remove.href = '#!';
        remove.classList.add('secondary-content');
        remove.title = `Remove ${user.real}`;
        remove.innerHTML = '<i class="material-icons grey-text">close</i>';
        remove.addEventListener('click', event => {
          event.preventDefault();
          removePlayer(key);
        });
        item.appendChild(remove);
      }
      nameList.appendChild(item);
    }

    startButton.classList.toggle('disabled', count < 2 || revealing);
  }

  // Refresh "offline · Xm ago" labels and the remove buttons as time passes.
  setInterval(renderLobby, 30000);

  document.getElementById('roomResetButton').addEventListener('click', () => {
    db.ref(`games/${gameID}`).update({ state: 'resetting' });
  });

  document.getElementById('roomDeleteButton').addEventListener('click', () => {
    db.ref(`games/${gameID}`).update({ state: 'deleting' });
  });

  startButton.addEventListener('click', async () => {
    if (startButton.classList.contains('disabled')) return;
    const playIcon = document.getElementById('playIcon');
    const revealSpinner = document.getElementById('revealSpinner');

    playIcon.classList.add('hide');
    revealSpinner.classList.remove('hide');
    startButton.classList.add('disabled');

    try {
      await flashNames({ text: gameID });
    } catch (err) {
      M.toast({ html: err.message });
    } finally {
      playIcon.classList.remove('hide');
      revealSpinner.classList.add('hide');
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
      document.getElementsByClassName('reveal')[0].classList.add('hide');
      document.getElementsByClassName('play')[0].classList.remove('hide');
      secretName.value = '';
      sessionStorage.removeItem(`secret:${code}`);
      showSetup();
      document.getElementById('playTab').classList.add('disabled');
      document.getElementById('playPage').classList.add('hide');
      await db.ref(`games/${code}/users`).remove().catch(() => {});
      await db.ref(`games/${code}/secrets`).remove().catch(() => {});
    }
  }

  function displaySecrets() {
    if (revealing) return;
    revealing = true;
    const code = gameID;
    document.getElementById('createTab').classList.add('disabled');
    document.getElementById('setupTab').classList.add('disabled');
    document.getElementsByClassName('play')[0].classList.add('hide');
    document.getElementsByClassName('reveal')[0].classList.remove('hide');
    const panel = document.getElementById('revealPanel');

    db.ref(`games/${code}/names`).once('value', snapshot => {
      show(snapshot.val() || []);
    });

    function show(fakes) {
      const bar = document.getElementById('progressBar');
      bar.style.setProperty('width', `0%`);

      // const voice = speechSynthesis.getVoices().filter(i => i.lang.includes('en-GB') && i.name.includes('emale'))[0];
      let utterance = new SpeechSynthesisUtterance();
      // utterance.voice = voice;

      fakes.forEach((name, i) => setTimeout(() => {
        if (localStorage.getItem('mute') === 'volume_up') {
          utterance.text = name;
          speechSynthesis.speak(utterance);
        }
        panel.textContent = name;
        bar.style.setProperty('width', `${100 * (i + 1) / fakes.length}%`);
      }, i * 2500))

      setTimeout(() => {
        revealing = false;
        panel.textContent = '';
        if (gameID === code && state === 'playing') {
          db.ref(`games/${code}`).update({ state: 'waiting' });
        }
        document.getElementById('createTab').classList.remove('disabled');
        document.getElementById('setupTab').classList.remove('disabled');
        document.getElementsByClassName('play')[0].classList.remove('hide');
        document.getElementsByClassName('reveal')[0].classList.add('hide');
        renderLobby();
      }, fakes.length * 2500);
    }
  }

  // ---------------------------------------------------------------------------
  // Open the room from a game link (a reload keeps ?code= in the address bar).

  let urlCode = (new URL(document.location)).searchParams.get('code');
  if (urlCode) {
    tryJoining(urlCode);
  } else {
    showCreate();
  }
});
