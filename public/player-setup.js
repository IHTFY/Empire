import { $ } from './dom.js';
import { closeSheet } from './sheets.js';

// Owns name inputs, validation, and submission. Room state is read at the moment of each action.
export function createPlayerSetup({ db, getRoom, getUid, ui, crestPicker, savePresenceName }) {
  const realName = $('realName');
  const realNameHelper = $('realNameHelper');
  const secretName = $('secretName');
  const secretNameHelper = $('secretNameHelper');
  const secretBox = $('secretBox');
  const { show, toast } = ui;

  const SECRET_MAX = 24; // keep in sync with maxlength in index.html and database.rules.json

  // Case and spacing are normalized; any other unsupported character is rejected, never dropped.
  function normalizeName(raw) {
    return raw.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function unsupportedChars(name) {
    return [...new Set(name.match(/[^ a-z0-9]/g))];
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
      el.style.setProperty('--d', `${(secretShown ? i : chars.length - 1 - i) * 22}ms`);
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
    $('submitLabel').textContent = getRoom().users[getUid()] ? 'Save names' : 'Enter the lobby';
    crestPicker.render();
    show('setup');
  }

  realName.addEventListener('input', () => {
    realName.classList.remove('invalid');
    realNameHelper.textContent = '';
  });

  $('namesForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!getRoom().id) return;

    const userRealName = realName.value.trim().slice(0, 100);
    const userFakeName = normalizeName(secretName.value).slice(0, SECRET_MAX);
    let ok = true;

    const taken = Object.entries(getRoom().users).some(([key, user]) =>
      key !== getUid() && user.real && user.real.toLowerCase() === userRealName.toLowerCase());
    if (userRealName === '') {
      realName.classList.add('invalid');
      realNameHelper.textContent = 'Enter your name';
      ok = false;
    } else if (taken) {
      realName.classList.add('invalid');
      realNameHelper.textContent = 'Someone in this room already uses that name';
      ok = false;
    }

    const badChars = unsupportedChars(userFakeName);
    if (userFakeName === '') {
      secretBox.classList.add('invalid');
      secretNameHelper.textContent = 'Pick a secret name (letters and numbers)';
      ok = false;
    } else if (badChars.length) {
      secretBox.classList.add('invalid');
      secretNameHelper.textContent =
        'Secret names can only use letters A-Z, numbers and spaces.';
      ok = false;
    }

    if (!ok) return;

    const code = getRoom().id;
    if (getRoom().state === 'resetting') {
      toast('The new round is getting ready. Try again in a moment.');
      return;
    }
    if (getRoom().locked || getRoom().state !== 'waiting') {
      toast('Names are locked until the next round.');
      return;
    }
    // A submission racing Start either commits before the roster freezes or is rejected.
    try {
      await db.ref(`games/${code}`).update({
        [`users/${getUid()}/real`]: userRealName,
        [`users/${getUid()}/clan`]: userRealName,
        [`secrets/${getUid()}`]: userFakeName
      });
    } catch (err) {
      toast('Could not save your names. The round may have started; try again next round.');
      return;
    }
    if (getRoom().id !== code) return;
    localStorage.setItem('realName', userRealName);
    localStorage.setItem(`secret:${code}`, userFakeName);
    savePresenceName(userRealName);
    // Written on its own so a database without crest support still accepts the names.
    db.ref(`games/${getRoom().id}/users/${getUid()}/crest`).set(crestPicker.value()).catch(() => {});

    show('lobby');
  });

  $('editNames').addEventListener('click', () => {
    const room = getRoom();
    const uid = getUid();
    closeSheet($('optionsDialog'));
    if (room.locked) {
      toast('Names are locked until the next round.');
      return;
    }
    if (room.users[uid]) {
      realName.value = room.users[uid].real;
    }
    setSecret(localStorage.getItem(`secret:${room.id}`) || '');
    openSetup();
  });

  return { open: openSetup, setSecret };
}
