import { $ } from './dom.js';
import { openSheet } from './sheets.js';
import { initialOf, SHAPE_CHOICES, COLOR_CHOICES, COLOR_GRID, INKS, METAL_CHOICES, TRIMS, PATTERNS, EMBLEM_CHOICES, PART_OPTIONS, parseCrest, crestString, randomCrest, defaultCrest, crestSvg, crestDefs } from './crest.js';

// Owns the editable crest and its device persistence; crest.js remains the drawing library.
export function createCrestPicker({ getRoom, getUid }) {
  $('crestDefs').innerHTML = crestDefs();
  const stored = localStorage.getItem('crest');
  let crest = stored ? parseCrest(stored) : randomCrest();
  // A random crest stands in until a room shows the one this player already wears.
  let placeholder = !stored;
  const realName = $('realName');

  function saveCrest() {
    try { localStorage.setItem('crest', crestString(crest)); } catch (err) { /* private mode */ }
  }
  saveCrest();
  // Ask the browser not to evict the saved crest and names under storage pressure.
  navigator.storage?.persist?.().catch(() => {});

  // When this device lost its saved crest, keep the one the room still holds for this
  // player rather than replacing it with the random stand-in.
  function restore() {
    const saved = getRoom().users?.[getUid()]?.crest;
    if (!placeholder || !saved) return;
    placeholder = false;
    crest = parseCrest(saved);
    saveCrest();
  }

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

  // One tab per part, shown as a pin on the big crest. Trim covers two parts: the border style and its metal.
  // The emblem's color offers every field color, and Auto.
  const tabs = [
    { id: 'shape', label: 'Shape', parts: { shape: { options: SHAPE_CHOICES, order: ['accolade', 'cartouche', 'ogee', 'scallop', 'horsehead', 'pavise', 'vesica', 'lozenge', 'crescent', 'thureos', 'scutum', 'ancile', 'boeotian', 'vexillum', 'gonfanon', 'hoplon', 'heater', 'spanish', 'swiss', 'polish', 'bouche', 'kite', 'standard', 'tablet', 'peltast', 'banner', 'oval', 'pennon'] } } },
    { id: 'color', label: 'Color', parts: { color: { options: COLOR_CHOICES } } },
    { id: 'pattern', label: 'Pattern', parts: { pattern: { options: PATTERNS } } },
    { id: 'emblem', label: 'Emblem', parts: { emblem: { options: EMBLEM_CHOICES, order: ['lion', 'wolf', 'horse', 'pegasus', 'unicorn', 'minotaur', 'griffin', 'aquila', 'doubleeagle', 'phoenix', 'dragon', 'wyvern', 'hydra', 'twinwyrm', 'serpent', 'ouroboros', 'medusa', 'spartan', 'helm', 'sword', 'gladius', 'axe', 'spears', 'trident', 'thunder', 'crown', 'laurel', 'sun', 'cross', 'botonny', 'maltese', 'letter'] } } },
    { id: 'ink', label: 'Emblem color', parts: { ink: { options: { auto: INKS.auto, ...COLOR_CHOICES } } } },
    { id: 'trim', label: 'Trim', parts: { trim: { label: 'Style', options: TRIMS }, metal: { label: 'Metal', options: METAL_CHOICES } } }
  ];
  let activeTab = 'emblem';
  let displayedCrest = '';
  // Tiles redraw only while their panel shows; hidden panels catch up when opened.
  const stale = new Set(tabs.map(tab => tab.id));
  const tabButtons = new Map();
  const panels = new Map();
  const groups = new Map();
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery.matches;

  function optionButton(part, value) {
    const option = PART_OPTIONS[part][value];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.part = part;
    btn.dataset.value = value;
    if (option.hex) btn.style.setProperty('--c', option.hex);
    // Colors are plain swatches; the panel names the chosen one.
    if (part === 'color' || part === 'ink') {
      btn.className = value === 'auto' ? 'crest-swatch crest-swatch-auto' : 'crest-swatch';
      btn.setAttribute('aria-label', option.label);
      btn.title = option.label;
      return btn;
    }
    btn.className = part === 'metal' ? 'crest-tile crest-swatch-tile' : 'crest-tile';
    btn.innerHTML = '<span class="crest-tile-art"></span><span class="crest-tile-label"></span>';
    btn.lastChild.textContent = option.label;
    return btn;
  }

  // A retired option this player still wears stays selectable after the others.
  function addOptions(group) {
    const { part, keys, exclude = [] } = groups.get(group);
    [...keys, crest[part]].forEach(key => {
      if (!exclude.includes(key) && !group.querySelector(`[data-value="${key}"]`)) group.appendChild(optionButton(part, key));
    });
  }

  // Colors sit in a grid: the rainbow across, each from pale at the top to dark at the bottom,
  // with the grays last. Tap one, or drag across the grid with a loupe following. Auto, and
  // a retired color this player still wears, sit beside the chosen color's name.
  const gridKeys = COLOR_GRID.flat();
  const columns = COLOR_GRID[0].length;
  const pads = new Map();

  function buildPad(panel, part, label) {
    const head = document.createElement('div');
    head.className = 'crest-pad-head';
    head.innerHTML = '<span class="crest-pad-name"></span>';
    const extras = document.createElement('div');
    extras.className = 'crest-swatches';
    groups.set(extras, { part, keys: part === 'ink' ? ['auto'] : [], exclude: gridKeys });
    extras.setAttribute('role', 'group');
    extras.setAttribute('aria-label', 'More colors');
    head.appendChild(extras);
    const pad = document.createElement('div');
    pad.className = 'crest-pad';
    pad.innerHTML = '<div class="crest-pad-cells" role="group"></div><span class="crest-pad-loupe"></span>';
    const cells = pad.firstChild;
    cells.setAttribute('aria-label', label);
    pad.style.setProperty('--cols', columns);
    pad.style.setProperty('--rows', COLOR_GRID.length);
    gridKeys.forEach((key, i) => {
      const cell = optionButton(part, key);
      cell.className = i % columns === columns - 1 ? 'crest-pad-cell crest-pad-gray' : 'crest-pad-cell';
      cell.tabIndex = -1;
      cells.appendChild(cell);
    });
    pads.set(part, pad);
    const pick = event => {
      const box = cells.getBoundingClientRect();
      const at = (offset, size, count) => Math.max(0, Math.min(count - 1, Math.floor(offset / size * count)));
      const key = COLOR_GRID[at(event.clientY - box.top, box.height, COLOR_GRID.length)][at(event.clientX - box.left, box.width, columns)];
      choose(part, key);
      pad.querySelector(`[data-value="${key}"]`).focus({ preventScroll: true });
    };
    cells.addEventListener('pointerdown', event => {
      cells.setPointerCapture(event.pointerId);
      pad.classList.add('dragging');
      pick(event);
      event.preventDefault();
    });
    cells.addEventListener('pointermove', event => {
      if (cells.hasPointerCapture(event.pointerId)) pick(event);
    });
    ['pointerup', 'pointercancel'].forEach(type => cells.addEventListener(type, () => pad.classList.remove('dragging')));
    // The arrow keys move around the grid; from a color not on it, they start at the top left.
    cells.addEventListener('keydown', event => {
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
      if (!step) return;
      const index = gridKeys.indexOf(crest[part]);
      const next = index < 0 ? 0 : index + step;
      if (next < 0 || next >= gridKeys.length || (Math.abs(step) === 1 && Math.floor(next / columns) !== Math.floor(index / columns))) return;
      choose(part, gridKeys[next]);
      cells.children[next].focus();
      event.preventDefault();
    });
    panel.append(head, pad);
  }

  function renderPad(part) {
    const pad = pads.get(part);
    const value = crest[part];
    const index = gridKeys.indexOf(value);
    pad.parentNode.querySelector('.crest-pad-name').textContent = PART_OPTIONS[part][value].label;
    pad.classList.toggle('off', index < 0);
    if (index >= 0) {
      pad.style.setProperty('--col', index % columns);
      pad.style.setProperty('--row', Math.floor(index / columns));
      pad.style.setProperty('--c', PART_OPTIONS[part][value].hex);
    }
    [...pad.firstChild.children].forEach((cell, i) => { cell.tabIndex = i === Math.max(index, 0) ? 0 : -1; });
  }

  function choose(part, value) {
    if (crest[part] === value) return;
    placeholder = false;
    crest[part] = value;
    saveCrest();
    renderCrest();
  }

  function buildPanel(panel, tab) {
    if (tab.id === 'color' || tab.id === 'ink') return buildPad(panel, tab.id, tab.label);
    Object.entries(tab.parts).forEach(([part, spec]) => {
      if (spec.label) {
        const label = document.createElement('span');
        label.className = 'eyebrow crest-grid-label';
        label.textContent = spec.label;
        panel.appendChild(label);
      }
      const group = document.createElement('div');
      group.className = 'crest-grid';
      groups.set(group, { part, keys: spec.order || Object.keys(spec.options) });
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', `${spec.label || tab.label} options`);
      panel.appendChild(group);
    });
  }

  function buildCrestOptions() {
    const tabList = $('crestTabs');
    tabs.forEach(tab => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'crest-pin';
      button.id = `crestTab-${tab.id}`;
      button.innerHTML = '<span class="crest-pin-dot"></span><span class="crest-pin-label"></span>';
      button.lastChild.textContent = tab.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `crestPanel-${tab.id}`);
      button.addEventListener('click', () => showTab(tab.id));
      tabList.appendChild(button);
      tabButtons.set(tab.id, button);

      const panel = document.createElement('div');
      panel.className = `crest-panel crest-panel-${tab.id}${tab.id === 'ink' ? ' crest-panel-color' : ''}`;
      panel.id = `crestPanel-${tab.id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      buildPanel(panel, tab);
      $('crestOptions').appendChild(panel);
      panels.set(tab.id, panel);
    });
    tabList.addEventListener('keydown', event => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!step) return;
      const index = tabs.findIndex(tab => tab.id === activeTab);
      const next = tabs[(index + step + tabs.length) % tabs.length].id;
      showTab(next);
      tabButtons.get(next).focus();
      event.preventDefault();
    });
    $('crestOptions').addEventListener('click', event => {
      const tile = event.target.closest('button[data-part]');
      if (tile) choose(tile.dataset.part, tile.dataset.value);
    });
    $('crestBig').addEventListener('click', event => {
      const part = partAt(event);
      if (part) showTab(part);
    });
  }

  // Which part of the big crest a tap landed on: the emblem's box, the border and its
  // studs, the pattern's shading, or the field.
  function partAt(event) {
    const emblem = $('crestBig').querySelector('.crest > g, .crest > text');
    const box = emblem?.getBoundingClientRect();
    if (box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) return 'emblem';
    const target = event.target;
    if (target.matches('circle, path[fill="none"]')) return 'trim';
    if (target.matches('path[clip-path]')) return 'pattern';
    if (target.matches('.crest > path')) return 'color';
    return null;
  }

  // Bring the chosen tile into the middle of its scrolling panel.
  function revealSelection(animate) {
    const panel = panels.get(activeTab);
    const tile = panel.querySelector('.crest-grid [aria-pressed="true"]');
    if (!tile || panel.scrollHeight <= panel.clientHeight) return;
    // Bounding boxes, not offsetTop: the tab's entrance transform makes the panel the tile's offset parent.
    const top = panel.scrollTop + tile.getBoundingClientRect().top - panel.getBoundingClientRect().top - (panel.clientHeight - tile.offsetHeight) / 2;
    panel.scrollTo({ top: Math.max(0, top), behavior: animate && !reducedMotion() ? 'smooth' : 'instant' });
  }

  function showTab(id, { animate = true } = {}) {
    const changed = activeTab !== id;
    activeTab = id;
    tabButtons.forEach((button, key) => {
      button.setAttribute('aria-selected', String(key === id));
      button.tabIndex = key === id ? 0 : -1;
    });
    panels.forEach((panel, key) => {
      panel.hidden = key !== id;
      if (key === id && changed && animate && !reducedMotion()) {
        panel.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      }
    });
    renderTiles();
    revealSelection(false);
  }

  function renderTiles() {
    const id = activeTab;
    if (!stale.has(id)) return;
    stale.delete(id);
    const panel = panels.get(id);
    const letter = initialOf(realName.value) || '?';
    if (pads.has(id)) renderPad(id);
    panel.querySelectorAll('.crest-grid, .crest-swatches').forEach(addOptions);
    panel.querySelectorAll('button[data-part]').forEach(tile => {
      const { part, value } = tile.dataset;
      tile.setAttribute('aria-pressed', String(crest[part] === value));
      if (part === 'metal' || part === 'color' || part === 'ink') return;
      // Patterns are shown without the emblem so the division is easy to see.
      const preview = { ...crest, [part]: value, ...(part === 'pattern' ? { emblem: 'letter' } : {}) };
      tile.firstChild.innerHTML = crestSvg(preview, { letter: part === 'pattern' ? '' : letter });
    });
  }

  function animateCrest(element, changed) {
    element.getAnimations().forEach(animation => animation.cancel());
    if (changed && !reducedMotion()) {
      element.animate([
        { opacity: .55, transform: 'translateY(2px) scale(.96)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  }

  function renderCrest() {
    const letter = initialOf(realName.value) || '?';
    const nextCrest = crestString(crest) + letter;
    const changed = displayedCrest && displayedCrest !== nextCrest;
    displayedCrest = nextCrest;
    $('crestPreview').innerHTML = crestSvg(crest, { letter });
    animateCrest($('crestPreview'), changed);
    tabs.forEach(tab => stale.add(tab.id));
    if (!$('crestDialog').open) return;
    $('crestBig').innerHTML = crestSvg(crest, { letter });
    animateCrest($('crestBig'), changed);
    const taken = crestTaken();
    $('crestNote').classList.toggle('taken', taken);
    $('crestNote').textContent = taken ? 'Someone in this room already bears this crest. Change a part to stand apart.' : '';
    renderTiles();
  }

  buildCrestOptions();

  $('crestButton').addEventListener('click', () => {
    openSheet($('crestDialog'));
    renderCrest();
    showTab(activeTab, { animate: false });
  });
  $('crestShuffle').addEventListener('click', () => {
    const emblems = Object.keys(EMBLEM_CHOICES);
    placeholder = false;
    crest = { ...randomCrest(), emblem: emblems[Math.floor(Math.random() * emblems.length)] };
    saveCrest();
    renderCrest();
    revealSelection(true);
  });
  realName.addEventListener('input', renderCrest);
  renderCrest();

  return {
    render: () => { restore(); renderCrest(); },
    value: () => crestString(crest)
  };
}
