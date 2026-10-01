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

// Compose the controllers here. Modules own their state and communicate through these
// callbacks, so they do not import each other in a cycle or rely on application globals.
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.empireFirebaseReady;
  } catch (err) {
    console.error(err);
    $('userGameCodeHelper').textContent = 'Could not connect. Reload to try again.';
    return;
  }

  let uid = null;
  const signedIn = new Promise(resolve => {
    firebase.auth().onAuthStateChanged(user => {
      if (!user) {
        firebase.auth().signInAnonymously().catch(err => {
          console.error(`Error code ${err.code}: ${err.message}`);
        });
      } else {
        // Anonymous identity persists in this browser, including after a reload.
        uid = user.uid;
        if (localStorage.getItem('realName') && !$('realName').value) {
          $('realName').value = localStorage.getItem('realName');
        }
        resolve();
      }
    });
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
  const audio = createAudio({ db, rollNumber: ui.rollNumber });
  const rooms = createRooms({
    db, signedIn, getUid, ui, audio,
    onChange: () => lobby.render(),
    onDetach: () => lobby.reset(),
    onEnter: () => reveal.resetAnnouncements(),
    onUsers: users => reveal.rememberBots(users),
    onEliminated: snapshot => reveal.observeEliminated(snapshot),
    onPlaybackStart: () => reveal.play(),
    onPlaybackStop: () => reveal.cancel(),
    openSetup: () => setup.open(),
    setSecret: value => setup.setSecret(value)
  });
  const getRoom = rooms.getSnapshot;
  home = createHome({ db, signedIn, enterRoom: rooms.enter, setRoomInUrl: rooms.setRoomInUrl, ui });
  initializeSharing({ getRoom, roomLink: rooms.roomLink, toast: ui.toast });
  const crestPicker = createCrestPicker({ getRoom, getUid });
  setup = createPlayerSetup({ db, getRoom, getUid, ui, crestPicker, savePresenceName: rooms.savePresenceName });
  lobby = createLobby({
    getRoom, getUid, ui,
    isRevealing: () => reveal.isRevealing(),
    removePlayer: rooms.removePlayer,
    removeWatcher: rooms.removeWatcher,
    capturePlayer: rooms.capturePlayer,
    releasePlayer: rooms.releasePlayer
  });
  createLobbyTransitions({ lobby });
  // Refresh offline durations and removal eligibility as time passes.
  setInterval(lobby.render, 30000);
  createBots({ db, getRoom, toast: ui.toast });
  reveal = createReveal({ db, flashNames, getRoom, audio, ui, refreshLobby: lobby.render });

  // Open the room from a link (a reload keeps it in the address bar), or go back to the
  // room this device was last in.
  const params = new URL(document.location).searchParams;
  const lastRoom = rememberedRoom();
  if (params.get('room')) {
    home.join(params.get('room'), params.get('pass') || '');
  } else if (params.get('code')) {
    home.joinOldLink(params.get('code'));
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
