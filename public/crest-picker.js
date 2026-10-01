import { $ } from './dom.js';
import { openSheet } from './sheets.js';
import { initialOf, SHAPES, COLORS, METALS, PATTERNS, EMBLEMS, parseCrest, crestString, randomCrest, defaultCrest, crestSvg, crestDefs } from './crest.js';

// Owns the editable crest and its device persistence; crest.js remains the drawing library.
export function createCrestPicker({ getRoom, getUid }) {
  $('crestDefs').innerHTML = crestDefs();
  let crest = localStorage.getItem('crest') ? parseCrest(localStorage.getItem('crest')) : randomCrest();
  const realName = $('realName');

  function saveCrest() {
    try { localStorage.setItem('crest', crestString(crest)); } catch (err) { /* private mode */ }
  }
  saveCrest();

  // Another player in this room already bears the same crest (with the same letter, if any).
  function crestTaken() {
    const { users } = getRoom();
    const uid = getUid();
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

  return { render: renderCrest, value: () => crestString(crest) };
}
