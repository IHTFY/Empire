import { readStored, writeStored, removeStored } from './storage.js';
import { $ } from './dom.js';
import { closeSheet } from './sheets.js';
import { summarizePresence } from './presence.js';
import { createRoomPresence } from './room-presence.js';
import { capturePlan, clearStaleCaptures, releasePlan, writeLeave, writeRemoval } from './captures.js';

// The room in the address bar is also remembered on this device, so closing the app (or
// the tab) and opening it again from the home screen goes straight back to the room.
const LAST_ROOM_KEY = 'lastRoom';

export function rememberRoom(name, pass) {
  try {
    if (name) writeStored(LAST_ROOM_KEY, JSON.stringify(pass ? { room: name, pass } : { code: name }));
    else removeStored(LAST_ROOM_KEY);
  } catch (err) { /* private mode */ }
}

export function rememberedRoom() {
  try {
    const saved = JSON.parse(readStored(LAST_ROOM_KEY));
    return saved && typeof saved === 'object' ? saved : null;
  } catch (err) {
    return null;
  }
}

// Owns room state, database subscriptions, and entry/exit. The entry point supplies screen and playback callbacks.
export function createRooms({
  db, ensureSignedIn, getUid, ui, audio,
  onChange, onDetach, onRoundReset, onEnter, onUsers, onEliminated,
  onPlaybackStart, onPlaybackStop, onRoundLocked, openSetup, setSecret
}) {
  const { show, toast, fitMarquees } = ui;
  const realName = $('realName');
  const startButton = $('revealSecrets');
  let gameID = null;
  let listeners = [];
  let users = {};
  let captures = {};
  let capturesReady = false;
  let claims = {};
  let presence = {};
  let state = null;
  let locked = false;
  let roomName = null;
  let roomPass = null;
  let entryAttempt = 0;
  let attachedAttempt = null;
  // This page shows the lobby of a revealed round to someone who is not playing in it.
  let watching = false;

  // Snapshots expose room data without giving another controller ownership of it.
  function getSnapshot() {
    return { id: gameID, name: roomName, pass: roomPass, users, captures, capturesReady, claims, presence, state, locked };
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

  // Recorded first: a value already in the cache calls back inside on(), and that call may detach.
  function listen(ref, callback) {
    listeners.push([ref, callback]);
    ref.on('value', callback);
  }

  function detachRoom() {
    onPlaybackStop();
    listeners.forEach(([ref, callback]) => ref.off('value', callback));
    listeners = [];
    const stopped = roomPresence.stop();
    gameID = null;
    attachedAttempt = null;
    roomName = null;
    roomPass = null;
    users = {};
    captures = {};
    capturesReady = false;
    claims = {};
    presence = {};
    state = null;
    locked = false;
    watching = false;
    document.title = 'Empire';
    onDetach();
    return stopped;
  }

  function beginEntry() { return ++entryAttempt; }
  function isEntryCurrent(attempt) { return attempt === entryAttempt; }

  async function enterRoom(code, attempt = beginEntry()) {
    if (!isEntryCurrent(attempt)) return;
    let entered = false;
    try {
      await ensureSignedIn();
      if (attempt !== entryAttempt) return;
      if (gameID && gameID !== code) {
        await leaveCurrentRoom({ goHome: false });
        if (attempt !== entryAttempt) return;
      }
      await detachRoom();
      if (attempt !== entryAttempt) return;
      gameID = code;
      attachedAttempt = attempt;
      const [nameSnap, passSnap] = await Promise.all([
        db.ref(`games/${code}/name`).once('value'), db.ref(`games/${code}/pass`).once('value')
      ]);
      if (attempt !== entryAttempt) return;
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

      const me = await db.ref(`games/${code}/users/${getUid()}`).once('value');
      if (attempt !== entryAttempt) return;
      users = me.exists() ? { [getUid()]: me.val() } : {};

      let first = true;
      listen(db.ref(`games/${code}/users`), snapshot => {
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
      listen(db.ref(`games/${code}/presence`), snapshot => {
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
      listen(db.ref(`games/${code}/captures`), snapshot => {
        captures = snapshot.val() || {};
        capturesReady = true;
        onChange();
      });
      listen(db.ref(`games/${code}/claims`), snapshot => {
        claims = snapshot.val() || {};
        onChange();
      });
      listen(db.ref(`games/${code}/state`), onStateChange);
      // The room was already gone, and this entry ended there.
      if (attempt !== entryAttempt) return;
      onEnter();
      listen(db.ref(`games/${code}/eliminated`), onEliminated);
      const lockedSnap = await db.ref(`games/${code}/locked`).once('value');
      if (attempt !== entryAttempt) return;
      locked = lockedSnap.val() === true;
      listen(db.ref(`games/${code}/locked`), snapshot => {
        locked = snapshot.val() === true;
        onChange();
        // The server opens the next round by itself when the last player leaves, with no
        // reset for this page to follow, so someone watching goes to name entry here.
        if (watching && !locked) showNextRound(code);
        // A player whose names were revealed has played this round; Home may show an ad after it.
        if (locked && users[getUid()]) {
          db.ref(`games/${code}/roundId`).once('value')
            .then(round => { if (attempt === entryAttempt && round.val()) onRoundLocked(`${code}/${round.val()}`); })
            .catch(err => console.error(err));
        }
      });

      if (!users[getUid()] && locked) {
        // The names have been revealed: newcomers watch until the next round.
        watching = true;
        show('lobby');
      } else if (users[getUid()]) {
        realName.value = users[getUid()].real;
        setSecret(readStored(`secret:${code}`) || '');
        show('lobby');
      } else {
        openSetup();
      }
      entered = true;
    } finally {
      // An entry that failed or was replaced leaves no listeners or presence behind.
      if (!entered && attachedAttempt === attempt) await detachRoom();
    }
  }

  // Leave the current room: remove my entry so nobody waits on me. Tapping Leave again before
  // that finishes, including reopening the room after a failure, waits for the same departure.
  let departure = null;
  function leaveRoom(options) {
    if (departure?.attempt !== entryAttempt) {
      const attempt = ++entryAttempt;
      const done = leaveCurrentRoom(options).finally(() => {
        if (departure?.done === done) departure = null;
      });
      departure = { attempt, done };
    }
    return departure.done;
  }

  async function leaveCurrentRoom({ goHome = true } = {}) {
    const attempt = entryAttempt;
    if (!gameID) return;
    const code = gameID;
    // My followers go free with me.
    const known = captures;
    // Stop listening first so removing myself isn't mistaken for being removed.
    await detachRoom();
    try {
      await writeLeave(db.ref(`games/${code}`), known, getUid(), {
        [`users/${getUid()}`]: null,
        [`secrets/${getUid()}`]: null,
        [`presence/${getUid()}`]: null
      });
    } catch (err) {
      // The server still lists the player, so the saved name stays. Switching rooms carries on
      // to the room just chosen; Leave reopens this one so it can be tried again.
      console.error(err);
      if (goHome && attempt === entryAttempt) await reopenAfterFailedLeave(code, attempt);
      return;
    }
    removeStored(`secret:${code}`);
    if (goHome && attempt === entryAttempt) {
      setRoomInUrl(null);
      show('home');
    }
  }

  async function reopenAfterFailedLeave(code, attempt) {
    try {
      const open = (await db.ref(`games/${code}/state`).once('value')).exists();
      if (!isEntryCurrent(attempt)) return;
      if (!open) {
        // The room closed meanwhile, which leaves nothing to leave.
        removeStored(`secret:${code}`);
        setRoomInUrl(null);
        show('home');
        return;
      }
      toast('Could not leave the room. Try again.');
      await enterRoom(code, attempt);
    } catch (err) {
      console.error(err);
      if (!isEntryCurrent(attempt)) return;
      // Drop whatever the reopening attached; the room stays saved for the next visit.
      await detachRoom();
      if (!isEntryCurrent(attempt)) return;
      toast('Could not leave the room.');
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
    if (state === null && previous === null) {
      // The room was removed after the check that it exists and before this first value.
      // When another room is already being opened, that entry detaches this one.
      if (!isEntryCurrent(attachedAttempt)) return;
      beginEntry();
      detachRoom();
      removeStored(`secret:${code}`);
      setRoomInUrl(null);
      show('home');
      toast('That room has closed.');
      return;
    }
    if (state === 'deleting' || (state === null && previous !== null)) {
      // Stop listening first so the room disappearing doesn't trigger this twice.
      const [name, pass] = [roomName, roomPass];
      await detachRoom();
      // The room's name is freed in the same write, so it can be used again right away.
      const gone = { [`games/${code}`]: null };
      if (pass) gone[`roomNames/${name}/${pass}`] = null;
      await db.ref().update(gone).catch(() => {});
      removeStored(`secret:${code}`);
      rememberRoom(null);
      window.location.replace('/');
    }
    if (state === 'resetting' && previous !== 'resetting') {
      // Forget membership before the server's roster/state callbacks arrive in either order.
      users = {};
      captures = {};
      claims = {};
      showNextRound(code);
      // The server clears the old roster and opens the next round.
    }
  }

  // Everyone, playing or watching, enters names again for the next round.
  function showNextRound(code) {
    watching = false;
    setSecret('');
    removeStored(`secret:${code}`);
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    $('submitLabel').textContent = 'Enter the lobby';
    onRoundReset();
    show('setup');
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
    const known = captures;
    // If the flag is refused (rules not updated yet), still remove the bot without announcing it.
    writeRemoval(room, known, key, update).catch(err => {
      if (!flagged) throw err;
      delete update[`eliminated/${key}`];
      return writeRemoval(room, known, key, update);
    }).catch(() => {
      toast('Could not remove that player');
      if (onFail) onFail();
    });
  }

  // Put a player in a leader's empire. A captured leader brings their followers along. Only
  // the captured player or someone in their empire may do this, which settles any claim.
  function capturePlayer(key, leader) {
    return writeCapture([key, leader], () => ({ ...capturePlan(captures, key, leader), [`claims/${key}`]: null }));
  }

  // Anyone else says who captured a player; the captured empire confirms or declines it.
  function claimCapture(key, leader) {
    return writeCapture([key, leader], () => ({ [`claims/${key}`]: { leader, by: getUid() } }));
  }

  // Clearing stale records first also covers ones left by pages from before leaders freed them.
  // The update is planned afterwards, from the records this page knows by then. A stale record
  // that another page has replaced, or that could not be cleared, stops the write.
  async function writeCapture(keys, plan) {
    const code = gameID;
    const room = db.ref(`games/${code}`);
    const cleared = await clearStaleCaptures(room, captures, users, keys);
    if (gameID !== code) return;
    if (!cleared) {
      toast('Could not capture that player');
      return;
    }
    await room.update(plan()).catch(() => toast('Could not capture that player'));
  }

  function dropClaim(key) {
    db.ref(`games/${gameID}/claims/${key}`).remove().catch(() => {});
  }

  // Undo a capture: the player goes free and their followers come back to them.
  function releasePlayer(key) {
    const update = releasePlan(captures, key, users);
    db.ref(`games/${gameID}`).update(update).catch(() => toast('Could not undo that capture'));
  }

  function removeWatcher(key) {
    return db.ref(`games/${gameID}/presence/${key}`).remove();
  }

  function savePresenceName(name) { roomPresence.setName(name); }

  return {
    getSnapshot,
    begin: beginEntry,
    isCurrent: isEntryCurrent,
    enter: enterRoom,
    leave: leaveRoom,
    setRoomInUrl,
    roomLink,
    removePlayer,
    removeWatcher,
    capturePlayer,
    claimCapture,
    dropClaim,
    releasePlayer,
    savePresenceName
  };
}
