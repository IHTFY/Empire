import { $ } from './dom.js';
import { openSheet } from './sheets.js';
import { initialOf, SHAPE_CHOICES, COLOR_CHOICES, METAL_CHOICES, TRIMS, PATTERNS, EMBLEM_CHOICES, PART_OPTIONS, parseCrest, crestString, randomCrest, defaultCrest, crestSvg, crestDefs } from './crest.js';

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

  // One tab per part. Trim covers two parts: the border style and its metal.
  const tabs = [
    { id: 'shape', label: 'Shape', parts: { shape: { options: SHAPE_CHOICES, order: ['accolade', 'cartouche', 'ogee', 'scallop', 'horsehead', 'pavise', 'vesica', 'lozenge', 'crescent', 'thureos', 'scutum', 'ancile', 'boeotian', 'vexillum', 'gonfanon', 'hoplon', 'heater', 'spanish', 'swiss', 'polish', 'bouche', 'kite', 'standard', 'tablet', 'peltast', 'banner', 'oval', 'pennon'] } } },
    { id: 'color', label: 'Color', parts: { color: { options: COLOR_CHOICES } } },
    { id: 'pattern', label: 'Pattern', parts: { pattern: { options: PATTERNS } } },
    { id: 'emblem', label: 'Emblem', parts: { emblem: { options: EMBLEM_CHOICES, order: ['dragon', 'wyvern', 'griffin', 'phoenix', 'hydra', 'twinwyrm', 'aquila', 'doubleeagle', 'ouroboros', 'medusa', 'pegasus', 'minotaur', 'unicorn', 'spartan', 'eagle', 'gladius', 'wolf', 'lion', 'spears', 'trident', 'thunder', 'helm', 'serpent', 'crown', 'sword', 'axe', 'laurel', 'horse', 'sun', 'cross', 'botonny', 'maltese', 'letter'] } } },
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
  let indicator;

  function optionButton(part, value) {
    const option = PART_OPTIONS[part][value];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.part = part;
    btn.dataset.value = value;
    btn.className = part === 'metal' ? 'crest-tile crest-swatch-tile' : 'crest-tile';
    btn.innerHTML = '<span class="crest-tile-art"></span><span class="crest-tile-label"></span>';
    btn.lastChild.textContent = option.label;
    if (option.hex) btn.style.setProperty('--c', option.hex);
    return btn;
  }

  // A retired option this player still wears stays selectable after the others.
  function addOptions(group) {
    const { part, keys } = groups.get(group);
    [...keys, crest[part]].forEach(key => {
      if (!group.querySelector(`[data-value="${key}"]`)) group.appendChild(optionButton(part, key));
    });
  }

  // Colors sit around a wheel with the crest in the middle: tap a color, or drag the knob
  // around the wheel. A retired color this player still wears gets the last slice, and keeps
  // it so the other slices don't shift under a finger.
  const wheel = document.createElement('div');
  let wheelColors = Object.keys(COLOR_CHOICES);
  let knobTurn = 0;

  function buildWheel(panel) {
    wheel.className = 'crest-wheel';
    wheel.tabIndex = 0;
    wheel.setAttribute('role', 'slider');
    wheel.setAttribute('aria-label', 'Color');
    wheel.innerHTML = '<span class="crest-wheel-ring"></span><span class="crest-wheel-arm"><span class="crest-wheel-knob"></span></span>'
      + '<span class="crest-wheel-center"><span class="crest-wheel-crest"></span><span class="crest-wheel-label"></span></span>';
    const pick = event => {
      const box = wheel.getBoundingClientRect();
      const turn = Math.atan2(event.clientX - box.left - box.width / 2, box.top + box.height / 2 - event.clientY) * 180 / Math.PI;
      choose('color', wheelColors[Math.floor(((turn + 360) % 360) / 360 * wheelColors.length)]);
    };
    wheel.addEventListener('pointerdown', event => {
      wheel.setPointerCapture(event.pointerId);
      wheel.classList.add('dragging');
      pick(event);
    });
    wheel.addEventListener('pointermove', event => {
      if (wheel.hasPointerCapture(event.pointerId)) pick(event);
    });
    ['pointerup', 'pointercancel'].forEach(type => wheel.addEventListener(type, () => wheel.classList.remove('dragging')));
    wheel.addEventListener('keydown', event => {
      const index = wheelColors.indexOf(crest.color);
      const last = wheelColors.length - 1;
      const next = { ArrowRight: index + 1, ArrowUp: index + 1, ArrowLeft: index - 1, ArrowDown: index - 1, Home: 0, End: last }[event.key];
      if (next === undefined) return;
      choose('color', wheelColors[(next + wheelColors.length) % wheelColors.length]);
      event.preventDefault();
    });
    panel.appendChild(wheel);
  }

  function renderWheel(letter) {
    if (!wheelColors.includes(crest.color)) wheelColors = [...wheelColors, crest.color];
    const slice = 360 / wheelColors.length;
    const hex = key => PART_OPTIONS.color[key].hex;
    wheel.querySelector('.crest-wheel-ring').style.background = `conic-gradient(${wheelColors.map((key, i) => `${hex(key)} ${i * slice}deg ${(i + 1) * slice}deg`).join(', ')})`;
    const index = wheelColors.indexOf(crest.color);
    // Turn the knob the short way round, so going from the last color to the first doesn't spin it.
    knobTurn += (((index + .5) * slice - knobTurn) % 360 + 540) % 360 - 180;
    wheel.querySelector('.crest-wheel-arm').style.transform = `rotate(${knobTurn}deg)`;
    wheel.style.setProperty('--c', hex(crest.color));
    const label = PART_OPTIONS.color[crest.color].label;
    wheel.setAttribute('aria-valuemin', '0');
    wheel.setAttribute('aria-valuemax', String(wheelColors.length - 1));
    wheel.setAttribute('aria-valuenow', String(index));
    wheel.setAttribute('aria-valuetext', label);
    wheel.querySelector('.crest-wheel-crest').innerHTML = crestSvg(crest, { letter });
    wheel.querySelector('.crest-wheel-label').textContent = label;
  }

  function choose(part, value) {
    if (crest[part] === value) return;
    placeholder = false;
    crest[part] = value;
    saveCrest();
    renderCrest();
  }

  function buildPanel(panel, tab) {
    if (tab.id === 'color') return buildWheel(panel);
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
    indicator = document.createElement('span');
    indicator.className = 'crest-tab-indicator';
    tabList.appendChild(indicator);
    tabs.forEach(tab => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'crest-tab';
      button.id = `crestTab-${tab.id}`;
      button.textContent = tab.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `crestPanel-${tab.id}`);
      button.addEventListener('click', () => showTab(tab.id));
      tabList.appendChild(button);
      tabButtons.set(tab.id, button);

      const panel = document.createElement('div');
      panel.className = `crest-panel crest-panel-${tab.id}`;
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
    window.addEventListener('resize', () => {
      if ($('crestDialog').open) moveIndicator(false);
    });
  }

  function moveIndicator(animate) {
    const button = tabButtons.get(activeTab);
    indicator.classList.toggle('no-motion', !animate);
    indicator.style.width = `${button.offsetWidth}px`;
    indicator.style.transform = `translateX(${button.offsetLeft}px)`;
  }

  // Bring the chosen tile into the middle of its scrolling panel.
  function revealSelection(animate) {
    const panel = panels.get(activeTab);
    const tile = panel.querySelector('.crest-grid [aria-pressed="true"]');
    if (!tile || panel.scrollHeight <= panel.clientHeight) return;
    const top = tile.offsetTop - panel.offsetTop - (panel.clientHeight - tile.offsetHeight) / 2;
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
    moveIndicator(animate);
    revealSelection(false);
  }

  function renderTiles() {
    const id = activeTab;
    if (!stale.has(id)) return;
    stale.delete(id);
    const panel = panels.get(id);
    const letter = initialOf(realName.value) || '?';
    if (id === 'color') return renderWheel(letter);
    panel.querySelectorAll('.crest-grid').forEach(addOptions);
    panel.querySelectorAll('button[data-part]').forEach(tile => {
      const { part, value } = tile.dataset;
      tile.setAttribute('aria-pressed', String(crest[part] === value));
      if (part === 'metal') return;
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
