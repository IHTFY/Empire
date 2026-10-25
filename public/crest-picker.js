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
    { id: 'trim', label: 'Trim', parts: { trim: { label: 'Style', options: TRIMS }, metal: { label: 'Metal', options: METAL_CHOICES, swatch: true } } }
  ];
  let activeTab = 'emblem';
  let displayedCrest = '';
  // Tiles redraw only while their panel shows; hidden panels catch up when opened.
  const stale = new Set(tabs.map(tab => tab.id));
  const tabButtons = new Map();
  const panels = new Map();
  // Each option group's part and its choices in display order.
  const groups = new Map();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function optionButton(part, value) {
    const option = PART_OPTIONS[part][value];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.part = part;
    btn.dataset.value = value;
    if (part === 'color') {
      btn.className = 'crest-ring-swatch';
      btn.setAttribute('aria-label', option.label);
    } else {
      btn.className = part === 'metal' ? 'crest-tile crest-swatch-tile' : 'crest-tile';
      btn.innerHTML = '<span class="crest-tile-art"></span><span class="crest-tile-label"></span>';
      btn.lastChild.textContent = option.label;
    }
    if (option.hex) btn.style.setProperty('--c', option.hex);
    return btn;
  }

  // A retired option this player still wears stays selectable after the others.
  function addOptions(group) {
    const { part, keys } = groups.get(group);
    [...keys, crest[part]].forEach(key => {
      if (!group.querySelector(`[data-value="${key}"]`)) group.appendChild(optionButton(part, key));
    });
    const swatches = group.querySelectorAll('.crest-ring-swatch');
    swatches.forEach((swatch, index) => swatch.style.setProperty('--i', index));
    group.style.setProperty('--n', swatches.length);
  }

  function buildPanel(panel, tab) {
    Object.entries(tab.parts).forEach(([part, spec]) => {
      if (spec.label) {
        const label = document.createElement('span');
        label.className = 'eyebrow crest-grid-label';
        label.textContent = spec.label;
        panel.appendChild(label);
      }
      // Colors sit on an ellipse around a preview of the crest, like a color wheel.
      const group = document.createElement('div');
      group.className = part === 'color' ? 'crest-ring' : 'crest-grid';
      groups.set(group, { part, keys: spec.order || Object.keys(spec.options) });
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', `${spec.label || tab.label} options`);
      if (part === 'color') {
        group.innerHTML = '<div class="crest-ring-center"><span class="crest-ring-crest"></span><span class="crest-ring-label"></span></div>';
      }
      addOptions(group);
      panel.appendChild(group);
    });
  }

  function buildCrestOptions() {
    const tabList = $('crestTabs');
    const indicator = document.createElement('span');
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
      if (!tile) return;
      const { part, value } = tile.dataset;
      if (crest[part] === value) return;
      placeholder = false;
      crest[part] = value;
      saveCrest();
      renderCrest();
    });
    window.addEventListener('resize', () => {
      if ($('crestDialog').open) moveIndicator(false);
    });
  }

  function moveIndicator(animate) {
    const button = tabButtons.get(activeTab);
    const indicator = $('crestTabs').querySelector('.crest-tab-indicator');
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
    panel.querySelectorAll('.crest-grid, .crest-ring').forEach(addOptions);
    panel.querySelectorAll('button[data-part]').forEach(tile => {
      const { part, value } = tile.dataset;
      tile.setAttribute('aria-pressed', String(crest[part] === value));
      if (part === 'color' || part === 'metal') return;
      // Patterns are shown without the emblem so the division is easy to see.
      const preview = { ...crest, [part]: value, ...(part === 'pattern' ? { emblem: 'letter' } : {}) };
      tile.firstChild.innerHTML = crestSvg(preview, { letter: part === 'pattern' ? '' : letter });
    });
    if (id === 'color') {
      panel.querySelector('.crest-ring-crest').innerHTML = crestSvg(crest, { letter });
      panel.querySelector('.crest-ring-label').textContent = PART_OPTIONS.color[crest.color].label;
    }
  }

  function renderCrest() {
    const letter = initialOf(realName.value) || '?';
    const nextCrest = crestString(crest) + letter;
    const changed = displayedCrest && displayedCrest !== nextCrest;
    displayedCrest = nextCrest;
    $('crestPreview').innerHTML = crestSvg(crest, { letter });
    function animateCrest(element) {
      element.getAnimations().forEach(animation => animation.cancel());
      if (changed && !reducedMotion()) {
        element.animate([
          { opacity: .55, transform: 'translateY(2px) scale(.96)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      }
    }
    animateCrest($('crestPreview'));
    tabs.forEach(tab => stale.add(tab.id));
    if (!$('crestDialog').open) return;
    $('crestBig').innerHTML = crestSvg(crest, { letter });
    animateCrest($('crestBig'));
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
