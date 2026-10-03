import { $ } from './dom.js';
import { suggestRoomName } from './room-names.js';

// Owns the create/join form and credential lookup; room entry and exit belong to rooms.js.
export function createHome({ db, ensureSignedIn, enterRoom, setRoomInUrl, ui }) {
  const userGameCode = $('userGameCode');
  const userGameCodeHelper = $('userGameCodeHelper');
  const { show, toast } = ui;
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

  // The create form fills the field with a memorable name (e.g. worried-hamster) that can be
  // kept, edited or rerolled; what is in the field is exactly what gets created. Each mode
  // remembers its own text while the other one is showing. The password is what keeps the
  // room private.
  let roomMode = 'create';
  const drafts = { create: suggestRoomName(), join: '' };
  userGameCode.value = drafts.create;
  userGameCode.placeholder = '';

  const roomNameField = $('roomNameField');
  const roomNameRoll = $('roomNameRoll');
  let roomNameRollTimer;
  function stopRoomNameRoll() {
    clearTimeout(roomNameRollTimer);
    roomNameField.classList.remove('is-rolling');
    roomNameRoll.replaceChildren();
  }
  function rollRoomName(previous, next) {
    stopRoomNameRoll();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // The real input already holds the new suggestion. Only its decorative letters roll.
    for (const [name, direction] of [[previous, 'out'], [next, 'in']]) {
      const track = document.createElement('span');
      track.className = `room-name-roll-track room-name-roll-${direction}`;
      [...name].forEach((letter, index) => {
        const glyph = document.createElement('span');
        glyph.textContent = letter;
        glyph.style.setProperty('--d', `${Math.min(index * 14, 180)}ms`);
        track.appendChild(glyph);
      });
      roomNameRoll.appendChild(track);
    }
    roomNameField.classList.add('is-rolling');
    roomNameRollTimer = setTimeout(stopRoomNameRoll, 620);
  }
  userGameCode.addEventListener('input', stopRoomNameRoll);
  userGameCode.addEventListener('focus', stopRoomNameRoll);
  userGameCode.addEventListener('pointerdown', stopRoomNameRoll);

  let formLocked = false;
  function lockForm(locked) {
    stopRoomNameRoll();
    formLocked = locked;
    userGameCode.readOnly = locked;
    roomPassInput.readOnly = locked;
    $('rerollName').disabled = locked;
  }

  const modeExtra = document.querySelector('.mode-extra');
  function sizeModeExtra() {
    const panel = modeExtra.querySelector(':scope > :not([inert])');
    modeExtra.style.height = `${panel.firstElementChild.scrollHeight}px`;
  }
  // Measure natural content, rather than the maximum of two overlapping collapsing panels.
  // This also follows wrapped hints, validation messages, and viewport/font changes.
  const modeExtraObserver = new ResizeObserver(sizeModeExtra);
  modeExtra.querySelectorAll(':scope > * > *').forEach(content => modeExtraObserver.observe(content));
  sizeModeExtra();

  function setRoomMode(mode) {
    stopRoomNameRoll();
    if (mode !== roomMode) {
      drafts[roomMode] = userGameCode.value;
      userGameCode.value = drafts[mode];
    }
    roomMode = mode;
    const joining = mode === 'join';
    $('roomForm').dataset.mode = mode;
    $('modeCreate').setAttribute('aria-pressed', String(!joining));
    $('modeJoin').setAttribute('aria-pressed', String(joining));
    $('passField').inert = !joining;
    $('createHint').inert = joining;
    $('roomSubmitLabel').textContent = joining ? 'Join' : 'Create';
    userGameCode.placeholder = joining ? 'Room name' : '';
    clearCodeError();
    sizeModeExtra();
  }

  // Puts the home form back to a fresh state with a new suggestion.
  function resetHomeForm() {
    drafts.create = suggestRoomName();
    drafts.join = '';
    userGameCode.value = drafts.create;
    roomPassInput.value = '';
    roomMode = 'create';
    setRoomMode('create');
  }

  $('rerollName').addEventListener('click', () => {
    if (formLocked) return;
    const previous = userGameCode.value;
    userGameCode.value = suggestRoomName();
    userGameCode.scrollLeft = 0;
    rollRoomName(previous, userGameCode.value);
    clearCodeError();
  });

  $('modeCreate').addEventListener('click', () => { if (!suppressModeClick && !formLocked) setRoomMode('create'); });
  $('modeJoin').addEventListener('click', () => { if (!suppressModeClick && !formLocked) setRoomMode('join'); });

  // The create / join switch can be dragged like a slider: the lit half follows the pointer
  // and, on release, settles on the closer side (or the side a quick flick points to).
  let suppressModeClick = false;
  {
    const track = document.querySelector('.mode-switch');
    let drag = null;
    const range = () => track.clientWidth / 2 - 4;
    const finish = () => {
      track.classList.remove('is-dragging');
      track.style.removeProperty('--drag-x');
      drag = null;
    };
    track.addEventListener('pointerdown', event => {
      if (formLocked || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      drag = {
        id: event.pointerId, x0: event.clientX, from: roomMode === 'join' ? range() : 0,
        pos: 0, moving: false, lastX: event.clientX, lastT: event.timeStamp, velocity: 0
      };
    });
    track.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x0;
      if (!drag.moving) {
        if (Math.abs(dx) < 6) return;
        drag.moving = true;
        track.setPointerCapture(event.pointerId);
        track.classList.add('is-dragging');
      }
      drag.pos = Math.min(range(), Math.max(0, drag.from + dx));
      track.style.setProperty('--drag-x', `${drag.pos}px`);
      const dt = event.timeStamp - drag.lastT;
      if (dt > 0) drag.velocity = 0.6 * drag.velocity + 0.4 * ((event.clientX - drag.lastX) / dt);
      drag.lastX = event.clientX;
      drag.lastT = event.timeStamp;
    });
    track.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.moving) {
        let joining = drag.pos > range() / 2;
        if (Math.abs(drag.velocity) > 0.5) joining = drag.velocity > 0;
        // The click that follows a drag must not toggle a second time.
        suppressModeClick = true;
        setTimeout(() => { suppressModeClick = false; }, 0);
        finish();
        setRoomMode(joining ? 'join' : 'create');
      } else {
        drag = null;
      }
    });
    track.addEventListener('pointercancel', () => { if (drag) finish(); });
    // Arrow keys move the switch too, on top of Tab and Enter / Space on each button.
    track.addEventListener('keydown', event => {
      if (formLocked || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      const joining = event.key === 'ArrowRight';
      setRoomMode(joining ? 'join' : 'create');
      $(joining ? 'modeJoin' : 'modeCreate').focus();
    });
  }

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
    const name = slugify(typed);
    if (!name) {
      codeError(typed ? 'Use letters or numbers in the room name.' : 'Enter a room name, or tap the circular arrow for a suggestion.');
      return;
    }
    // Show exactly the name being created, and keep it there until the room opens.
    userGameCode.value = name;
    await ensureSignedIn();
    const id = await claimRoom(name);
    if (!id) {
      codeError(`A room called ${name} is already open. Pick another name, or join it with its password.`);
      return;
    }
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
    await ensureSignedIn();
    const id = await findRoom(name, pass);
    if (!id) {
      backHome();
      passError(`No open room matches ${name} with that password.`);
      return;
    }
    await enterRoom(id);
  }

  // Rooms from before passwords are looked up by their key; false when it has closed.
  async function roomExists(code) {
    return code.length <= 128 && !/[.#$[\]/]/.test(code) &&
      Boolean((await db.ref(`games/${code}/state`).once('value').catch(() => null))?.exists());
  }

  // Links from before rooms had passwords: ?code=<room key>.
  async function joinOldLink(code) {
    await ensureSignedIn();
    if (await roomExists(code)) {
      await enterRoom(code);
    } else {
      setRoomInUrl(null);
      show('home');
      toast('That room has closed.');
    }
  }

  // Reopening the app goes back to the last room, quietly landing on home if it has closed.
  async function resume(saved) {
    await ensureSignedIn();
    let id = null;
    if (typeof saved.room === 'string' && typeof saved.pass === 'string') {
      id = await findRoom(slugify(saved.room), cleanPass(saved.pass));
    } else if (typeof saved.code === 'string' && await roomExists(saved.code)) {
      id = saved.code;
    }
    if (id) {
      await enterRoom(id);
    } else {
      setRoomInUrl(null);
      show('home');
    }
  }

  $('roomForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    lockForm(true);
    $('roomSubmit').classList.add('is-busy');
    try {
      await (roomMode === 'join' ? tryJoining() : tryCreating());
    } catch (err) {
      console.error(err);
      codeError('Something went wrong. Try again.');
    } finally {
      busy = false;
      lockForm(false);
      $('roomSubmit').classList.remove('is-busy');
    }
  });

  return { reset: resetHomeForm, join: tryJoining, joinOldLink, resume };
}
