import { $ } from './dom.js';
import { createUI } from './ui.js';
import { initializeSheets } from './sheets.js';
import { createAudio } from './audio.js';
import { createRooms, rememberRoom, rememberedRoom } from './rooms.js';
import { createHome } from './home.js';
import { createCrestPicker } from './crest-picker.js';
import { createPlayerSetup } from './player-setup.js';
import { createLobby } from './lobby/render.js';
import { createLobbyTransitions } from './lobby/transitions.js';
import { createBots } from './bots.js';
import { createReveal } from './reveal.js';
import { initializeSharing } from './share.js';
import { initializeUpdates } from './updates.js';
import { initializeFullscreen } from './fullscreen.js';
import appVersion from 'empire:version';

// Compose the controllers here. Modules own their state and communicate through these
// callbacks, so they do not import each other in a cycle or rely on application globals.
document.addEventListener('DOMContentLoaded', async () => {
  initializeUpdates(appVersion);
  try {
    await window.empireFirebaseReady;
  } catch (err) {
    console.error(err);
    $('userGameCodeHelper').textContent = 'Could not connect. Reload to try again.';
    return;
  }

  let uid = null;
  const adopt = user => {
    // Anonymous identity persists in this browser, including after a reload.
    uid = user.uid;
    if (localStorage.getItem('realName') && !$('realName').value) {
      $('realName').value = localStorage.getItem('realName');
    }
  };
  // Resolves once signed in. A failed attempt rejects and is forgotten, so the next
  // caller (a retry from the form, say) starts a fresh sign-in instead of waiting forever.
  let signingIn = null;
  const ensureSignedIn = () => {
    if (uid) return Promise.resolve();
    signingIn ??= firebase.auth().signInAnonymously()
      .then(credential => { adopt(credential.user); })
      .catch(err => {
        console.error(`Error code ${err.code}: ${err.message}`);
        throw err;
      })
      .finally(() => { signingIn = null; });
    return signingIn;
  };
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      adopt(user);
    } else {
      uid = null;
      ensureSignedIn().catch(() => {});
    }
  });

  const db = firebase.database();
  const flashNames = firebase.functions().httpsCallable('flashNames');
  const getUid = () => uid;
  let home, setup, lobby, reveal;
  const ui = createUI({
    resetHomeForm: () => home.reset(),
    fitTable: () => lobby.fitTable(),
    refreshLobby: () => lobby.render()
  });
  initializeSheets();
  initializeFullscreen(ui);
  const audio = createAudio({ db, rollNumber: ui.rollNumber });
  const rooms = createRooms({
    db, ensureSignedIn, getUid, ui, audio,
    onChange: () => lobby.render(),
    onDetach: () => { lobby.reset(); reveal.cancelAnnouncements(); },
    onRoundReset: () => reveal.cancelAnnouncements(),
    onEnter: () => reveal.resetAnnouncements(),
    onUsers: users => reveal.rememberBots(users),
    onEliminated: snapshot => reveal.observeEliminated(snapshot),
    onPlaybackStart: () => reveal.play().catch(err => {
      console.error(err);
      ui.toast('Could not load the reveal.');
    }),
    onPlaybackStop: () => reveal.cancel(),
    openSetup: () => setup.open(),
    setSecret: value => setup.setSecret(value)
  });
  const getRoom = rooms.getSnapshot;
  home = createHome({ db, ensureSignedIn, enterRoom: rooms.enter, setRoomInUrl: rooms.setRoomInUrl, ui });
  initializeSharing({ getRoom, roomLink: rooms.roomLink, toast: ui.toast });
  const crestPicker = createCrestPicker({ getRoom, getUid });
  setup = createPlayerSetup({ db, getRoom, getUid, ui, crestPicker, savePresenceName: rooms.savePresenceName });
  lobby = createLobby({
    getRoom, getUid, ui,
    isRevealing: () => reveal.isRevealing(),
    removePlayer: rooms.removePlayer,
    removeWatcher: rooms.removeWatcher,
    capturePlayer: rooms.capturePlayer,
    claimCapture: rooms.claimCapture,
    dropClaim: rooms.dropClaim,
    releasePlayer: rooms.releasePlayer,
    onCapture: capture => reveal.announceCapture(capture)
  });
  createLobbyTransitions({ lobby });
  // Refresh offline durations and removal eligibility as time passes.
  setInterval(lobby.render, 30000);
  createBots({ db, getRoom, getUid, toast: ui.toast });
  reveal = createReveal({ db, flashNames, getRoom, audio, ui, refreshLobby: lobby.render });

  // Open the room from a link (a reload keeps it in the address bar), or go back to the
  // room this device was last in.
  const params = new URL(document.location).searchParams;
  const lastRoom = rememberedRoom();
  const failedToOpen = err => {
    console.error(err);
    ui.show('home');
    ui.toast('Could not open that room. Try again.');
  };
  if (params.get('room')) {
    home.join(params.get('room'), params.get('pass') || '').catch(failedToOpen);
  } else if (params.get('code')) {
    home.joinOldLink(params.get('code')).catch(failedToOpen);
  } else if (lastRoom) {
    home.resume(lastRoom).catch(err => {
      console.error(err);
      rememberRoom(null);
      ui.show('home');
    });
  } else {
    ui.show('home');
  }
});
