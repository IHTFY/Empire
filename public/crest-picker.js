import { $ } from './dom.js';
import { openSheet } from './sheets.js';
import { createCrestCarousel } from './crest-carousel.js';
import { initialOf, SHAPES, SHAPE_CHOICES, COLORS, METALS, TRIMS, PATTERNS, EMBLEMS, EMBLEM_CHOICES, parseCrest, crestString, randomCrest, defaultCrest, crestSvg, crestDefs } from './crest.js';

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
    { part: 'shape', label: 'Shape', options: SHAPE_CHOICES, order: ['accolade', 'cartouche', 'ogee', 'scallop', 'pavise', 'vesica', 'crescent', 'scutum', 'boeotian', 'vexillum', 'hoplon', 'heater', 'kite', 'standard', 'tablet', 'peltast', 'banner', 'oval', 'pennon'] },
    { part: 'color', label: 'Color', options: COLORS, swatch: true },
    { part: 'pattern', label: 'Pattern', options: PATTERNS },
    { part: 'emblem', label: 'Emblem', options: EMBLEM_CHOICES, order: ['dragon', 'wyvern', 'griffin', 'phoenix', 'hydra', 'twinwyrm', 'doubleeagle', 'medusa', 'pegasus', 'minotaur', 'unicorn', 'spartan', 'eagle', 'gladius', 'legion', 'wolf', 'lion', 'spears', 'trident', 'thunder', 'helm', 'serpent', 'crown', 'sword', 'axe', 'laurel', 'horse', 'sun', 'column', 'amphora', 'cross', 'letter'] }
  ];
  let activePart = 'emblem';
  let displayedCrest = '';

  const carousels = new Map();

  function centerRows(animate = false) {
    carousels.forEach((carousel, part) => carousel.center(crest[part], { animate }));
  }

  function activateRow(section) {
    if (activePart === section.dataset.part) return;
    activePart = section.dataset.part;
    $('crestOptions').querySelectorAll('.crest-group').forEach(group => {
      group.classList.toggle('is-active', group === section);
    });
    // Tile art grows inside fixed slots, so switching rows never shifts the selection.
    carousels.forEach(carousel => carousel.paint());
  }

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
      section.dataset.part = group.part;
      section.classList.toggle('is-active', group.part === activePart);
      const head = document.createElement('div');
      head.className = 'crest-group-head';
      head.innerHTML = `<span class="eyebrow">${group.label}</span>`;
      const controls = document.createElement('div');
      controls.className = 'crest-row-controls';
      const selection = document.createElement('span');
      selection.className = 'crest-selection';
      controls.appendChild(selection);
      [-1, 1].forEach(step => {
        const arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.className = 'crest-row-arrow';
        arrow.dataset.step = step;
        arrow.setAttribute('aria-label', `${step < 0 ? 'Previous' : 'More'} ${group.label.toLowerCase()} options`);
        arrow.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${step < 0 ? 'm10 4-4 4 4 4' : 'm6 4 4 4-4 4'}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        arrow.addEventListener('click', () => {
          activateRow(section);
          carousels.get(group.part).advance(step);
        });
        controls.appendChild(arrow);
      });
      head.appendChild(controls);
      if (group.part === 'color') {
        const metals = document.createElement('div');
        metals.className = 'crest-metals';
        metals.innerHTML = '<span class="eyebrow">Trim</span>';
        const controls = document.createElement('div');
        controls.className = 'crest-trim-controls';
        const styles = document.createElement('div');
        styles.className = 'crest-trim-styles';
        styles.setAttribute('role', 'group');
        styles.setAttribute('aria-label', 'Trim style');
        Object.entries(TRIMS).forEach(([key, style]) => styles.appendChild(crestTile('trim', key, `${style.label} trim`)));
        const swatches = document.createElement('div');
        swatches.className = 'crest-trim-metals';
        swatches.setAttribute('role', 'group');
        swatches.setAttribute('aria-label', 'Trim metal');
        Object.entries(METALS).forEach(([key, metal]) => swatches.appendChild(crestTile('metal', key, `${metal.label} trim`, metal.hex)));
        controls.append(styles, swatches);
        metals.appendChild(controls);
        section.appendChild(metals);
      }
      const grid = document.createElement('div');
      grid.className = 'crest-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', `${group.label} options`);
      let keys = group.order || Object.keys(group.options);
      const options = { ...group.options };
      // Preserve a retired mark already worn by this player when centering the row.
      if (!options[crest[group.part]]) {
        const allOptions = group.part === 'shape' ? SHAPES : EMBLEMS;
        options[crest[group.part]] = allOptions[crest[group.part]];
        keys = [...keys, crest[group.part]];
      }
      const rail = document.createElement('div');
      rail.className = 'crest-rail';
      rail.appendChild(grid);
      section.prepend(head, rail);
      const carousel = createCrestCarousel({
        grid, keys,
        createTile: key => {
          const option = options[key];
          return crestTile(group.part, key, option.label, group.swatch && option.hex);
        },
        onActivate: () => activateRow(section),
        onBrowse: key => { selection.textContent = options[key].label; },
        onSelect: key => {
          if (crest[group.part] === key) return;
          crest[group.part] = key;
          saveCrest();
          renderCrest();
        }
      });
      carousels.set(group.part, carousel);
      box.appendChild(section);
    });
    box.addEventListener('click', event => {
      const tile = event.target.closest('.crest-tile');
      if (!tile || !['metal', 'trim'].includes(tile.dataset.part)) return;
      activateRow(tile.closest('.crest-group'));
      crest[tile.dataset.part] = tile.dataset.value;
      saveCrest();
      renderCrest();
    });
    window.addEventListener('resize', () => {
      if ($('crestDialog').open) centerRows();
    });
  }
  buildCrestOptions();

  function renderCrest() {
    const letter = initialOf(realName.value) || '?';
    const nextCrest = crestString(crest) + letter;
    const changed = displayedCrest && displayedCrest !== nextCrest;
    displayedCrest = nextCrest;
    $('crestPreview').innerHTML = crestSvg(crest, { letter });
    function animateCrest(element) {
      element.getAnimations().forEach(animation => animation.cancel());
      if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element.animate([
          { opacity: .55, transform: 'translateY(2px) scale(.96)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      }
    }
    animateCrest($('crestPreview'));
    if (!$('crestDialog').open) return;
    $('crestBig').innerHTML = crestSvg(crest, { letter });
    animateCrest($('crestBig'));
    const taken = crestTaken();
    $('crestNote').classList.toggle('taken', taken);
    $('crestNote').textContent = taken ? 'Someone in this room already bears this crest. Change a part to stand apart.' : 'Swipe to choose. Center is selected.';
    crestGroups.forEach(group => {
      const section = $('crestOptions').querySelector(`[data-part="${group.part}"]`);
      section.querySelector('.crest-selection').textContent = (group.part === 'emblem' ? EMBLEMS : group.part === 'shape' ? SHAPES : group.options)[crest[group.part]].label;
    });
    document.querySelectorAll('#crestOptions .crest-tile').forEach(tile => {
      const { part, value } = tile.dataset;
      tile.setAttribute('aria-pressed', String(crest[part] === value));
      if (part === 'color' || part === 'metal') return;
      if (part === 'trim') {
        tile.innerHTML = crestSvg({ ...crest, shape: 'hoplon', pattern: 'plain', emblem: 'letter', trim: value });
        return;
      }
      // Patterns are shown without the emblem so the division is easy to see.
      const preview = { ...crest, [part]: value, ...(part === 'pattern' ? { emblem: 'letter' } : {}) };
      tile.innerHTML = crestSvg(preview, { letter: part === 'pattern' ? '' : letter });
    });
    carousels.forEach(carousel => carousel.paint());
  }

  $('crestButton').addEventListener('click', () => {
    openSheet($('crestDialog'));
    renderCrest();
    requestAnimationFrame(() => centerRows());
  });
  $('crestShuffle').addEventListener('click', () => {
    const emblems = Object.keys(EMBLEM_CHOICES);
    crest = { ...randomCrest(), emblem: emblems[Math.floor(Math.random() * emblems.length)] };
    saveCrest();
    renderCrest();
    requestAnimationFrame(() => centerRows(true));
  });
  realName.addEventListener('input', renderCrest);
  renderCrest();

  return { render: renderCrest, value: () => crestString(crest) };
}
