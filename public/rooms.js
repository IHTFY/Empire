import { $ } from './dom.js';
import { closeSheet } from './sheets.js';
import { summarizePresence } from './presence.js';
import { createRoomPresence } from './room-presence.js';
import { capturePlan, releasePlan } from './captures.js';

// The room in the address bar is also remembered on this device, so closing the app (or
// the tab) and opening it again from the home screen goes straight back to the room.
const LAST_ROOM_KEY = 'lastRoom';

export function rememberRoom(name, pass) {
  try {
    if (name) localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(pass ? { room: name, pass } : { code: name }));
    else localStorage.removeItem(LAST_ROOM_KEY);
  } catch (err) { /* private mode */ }
}

export function rememberedRoom() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_ROOM_KEY));
    return saved && typeof saved === 'object' ? saved : null;
  } catch (err) {
    return null;
  }
}

// Owns room state, database subscriptions, and entry/exit. The entry point supplies screen and playback callbacks.
export function createRooms({
  db, signedIn, getUid, ui, audio,
  onChange, onDetach, onEnter, onUsers, onEliminated,
  onPlaybackStart, onPlaybackStop, openSetup, setSecret
}) {
  const { show, toast, fitMarquees } = ui;
  const realName = $('realName');
  const startButton = $('revealSecrets');
  let gameID = null;
  let listeners = [];
  let users = {};
  let captures = {};
  let capturesReady = false;
  let presence = {};
  let state = null;
  let locked = false;
  let roomName = null;
  let roomPass = null;

  // Snapshots expose room data without giving another controller ownership of it.
  function getSnapshot() {
    return { id: gameID, name: roomName, pass: roomPass, users, captures, capturesReady, presence, state, locked };
  }
  const roomPresence = createRoomPresence({ db, getRoom: getSnapshot, getUid, listen });

  function setRoomInUrl(name, pass) {
    rememberRoom(name, pass);
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

  function listen(ref, callback) {
    ref.on('value', callback);
    listeners.push([ref, callback]);
  }

  function detachRoom() {
    onPlaybackStop();
    listeners.forEach(([ref, callback]) => ref.off('value', callback));
    listeners = [];
    const stopped = roomPresence.stop();
    gameID = null;
    roomName = null;
    roomPass = null;
    users = {};
    captures = {};
    capturesReady = false;
    presence = {};
    state = null;
    locked = false;
    document.title = 'Empire';
    onDetach();
    return stopped;
  }

  async function enterRoom(code) {
    await signedIn;
    if (gameID && gameID !== code) {
      await leaveRoom({ goHome: false });
    }
    await detachRoom();
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

    // The home form is reset once the home screen is out of sight (see show), so the name
    // that was just created never flickers into something else.
    ui.markHomeFormStale();

    roomPresence.start();

    const me = await db.ref(`games/${gameID}/users/${getUid()}`).once('value');
    users = me.exists() ? { [getUid()]: me.val() } : {};

    let first = true;
    listen(db.ref(`games/${gameID}/users`), snapshot => {
      const hadMe = Boolean(users[getUid()]);
      const previous = users;
      users = snapshot.val() || {};
      onUsers(users);
      onChange();

      // Only a new player entering beeps; leaving or editing a name stays silent.
      const joined = Object.keys(users).filter(id => !previous[id]);
      if (!first && joined.length > 0) audio.chime();
      first = false;

      // Removed by someone else (for example after being offline too long).
      if (hadMe && !users[getUid()] && state !== 'resetting' && state !== 'deleting') {
        toast('You were removed from the lobby. Enter your names to rejoin.');
        openSetup();
      }
    });
    listen(db.ref(`games/${gameID}/presence`), snapshot => {
      const hadPresence = Boolean(presence[getUid()]);
      presence = Object.fromEntries(Object.entries(snapshot.val() || {}).map(([key, seen]) => [key, summarizePresence(seen)]));
      // A player removed my watching entry: leave the room.
      if (hadPresence && !presence[getUid()] && !users[getUid()] && state !== 'resetting' && state !== 'deleting') {
        toast('You were removed from the room.');
        leaveRoom();
        return;
      }
      onChange();
    });
    listen(db.ref(`games/${gameID}/captures`), snapshot => {
      captures = snapshot.val() || {};
      capturesReady = true;
      onChange();
    });
    listen(db.ref(`games/${gameID}/state`), onStateChange);
    onEnter();
    listen(db.ref(`games/${gameID}/eliminated`), onEliminated);
    locked = (await db.ref(`games/${gameID}/locked`).once('value')).val() === true;
    listen(db.ref(`games/${gameID}/locked`), snapshot => {
      locked = snapshot.val() === true;
      onChange();
    });

    if (!users[getUid()] && locked) {
      // The names have been revealed: newcomers watch until the next round.
      show('lobby');
    } else if (users[getUid()]) {
      realName.value = users[getUid()].real;
      setSecret(localStorage.getItem(`secret:${gameID}`) || '');
      show('lobby');
    } else {
      openSetup();
    }
  }

  // Leave the current room: remove my entry so nobody waits on me.
  async function leaveRoom({ goHome = true } = {}) {
    if (!gameID) return;
    const code = gameID;
    // Stop listening first so removing myself isn't mistaken for being removed.
    await detachRoom();
    await db.ref(`games/${code}`).update({
      [`users/${getUid()}`]: null,
      [`secrets/${getUid()}`]: null,
      [`presence/${getUid()}`]: null
    }).catch(err => console.error(err));
    localStorage.removeItem(`secret:${code}`);
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
    if (users[getUid()]) show('lobby');
    else leaveRoom();
  });

  async function requestRoomState(next) {
    if (!gameID || !users[getUid()]) return;
    try {
      await db.ref(`games/${gameID}/state`).set(next);
    } catch (err) {
      toast('Could not change the room. Try again.');
    }
  }
  $('roomResetButton').addEventListener('click', () => requestRoomState('resetting'));
  $('roomDeleteButton').addEventListener('click', () => requestRoomState('deleting'));

  async function onStateChange(snapshot) {
    const previous = state;
    state = snapshot.val();
    if (previous === 'playing' && state !== 'playing') onPlaybackStop();
    const code = gameID;

    if (state === 'playing' && previous !== 'playing') {
      onPlaybackStart();
    }
    // While the server records the names, everyone sees the Start button waiting.
    if (state === 'shuffling' || previous === 'shuffling') {
      if (previous === 'shuffling') startButton.querySelector('.spinner').hidden = true;
      onChange();
    }
    if (state === 'deleting' || (state === null && previous !== null)) {
      // Stop listening first so the room disappearing doesn't trigger this twice.
      const [name, pass] = [roomName, roomPass];
      await detachRoom();
      // The room's name is freed in the same write, so it can be used again right away.
      const gone = { [`games/${code}`]: null };
      if (pass) gone[`roomNames/${name}/${pass}`] = null;
      await db.ref().update(gone).catch(() => {});
      localStorage.removeItem(`secret:${code}`);
      rememberRoom(null);
      window.location.replace('/');
    }
    if (state === 'resetting' && previous !== 'resetting') {
      // Forget membership before the server's roster/state callbacks arrive in either order.
      users = {};
      captures = {};
      setSecret('');
      localStorage.removeItem(`secret:${code}`);
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      $('submitLabel').textContent = 'Enter the lobby';
      show('setup');
      // The server clears the old roster and opens the next round.
    }
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

  // Claim a player for a leader's empire. A captured leader brings their followers along.
  function capturePlayer(key, leader, onFail) {
    const update = capturePlan(captures, key, leader);
    db.ref(`games/${gameID}`).update(update).catch(() => {
      toast('Could not capture that player');
      if (onFail) onFail();
    });
  }

  // Undo a capture: the player goes free and their followers come back to them.
  function releasePlayer(key) {
    const update = releasePlan(captures, key);
    db.ref(`games/${gameID}`).update(update).catch(() => toast('Could not undo that capture'));
  }

  function removeWatcher(key) {
    return db.ref(`games/${gameID}/presence/${key}`).remove();
  }

  function savePresenceName(name) { roomPresence.setName(name); }

  return {
    getSnapshot,
    enter: enterRoom,
    leave: leaveRoom,
    setRoomInUrl,
    roomLink,
    removePlayer,
    removeWatcher,
    capturePlayer,
    releasePlayer,
    savePresenceName
  };
}
