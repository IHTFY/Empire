import { $ } from './dom.js';

// Owns screen visibility and small display helpers; screen controllers are supplied by the entry point.
export function createUI({ resetHomeForm, fitTable, refreshLobby }) {
  const screens = { home: $('homeScreen'), setup: $('setupScreen'), lobby: $('lobbyScreen') };
  let homeFormStale = false;
  function show(name) {
    if (name !== 'home' && homeFormStale) {
      resetHomeForm();
      homeFormStale = false;
    }
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    window.scrollTo(0, 0);
    requestAnimationFrame(fitMarquees);
    if (name === 'lobby') requestAnimationFrame(() => { fitTable(); refreshLobby(); });
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

  return {
    show,
    fitMarquees,
    rollNumber,
    toast,
    markHomeFormStale: () => { homeFormStale = true; }
  };
}
