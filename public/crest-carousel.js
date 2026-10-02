// Native scrolling supplies touch inertia and snapping. Three copies of the choices
// let the rail return to its middle copy without changing what the player sees.
export function createCrestCarousel({ grid, keys, createTile, onActivate, onBrowse, onSelect }) {
  const items = [];
  let selected = 0;
  let ready = false;
  let moving = false;
  let frame = 0;
  let settleTimer = 0;
  let focusAfterScroll = false;
  let touching = false;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (let copy = 0; copy < 3; copy++) {
    keys.forEach((key, index) => {
      const slot = document.createElement('span');
      slot.className = 'crest-carousel-item';
      const tile = createTile(key);
      tile.tabIndex = -1;
      if (copy !== 1) tile.setAttribute('aria-hidden', 'true');
      slot.appendChild(tile);
      grid.appendChild(slot);
      items.push({ slot, tile, index, copy });
    });
  }

  const step = () => items[0].slot.offsetWidth;
  const offsetFor = index => (index + .5) * step() - grid.clientWidth / 2;
  const nearest = () => Math.max(0, Math.min(items.length - 1, Math.round((grid.scrollLeft + grid.clientWidth / 2) / step() - .5)));

  function paint() {
    frame = 0;
    if (!ready || !grid.clientWidth) return;
    const slotWidth = step();
    // A long swipe can reach either physical end before it settles. Move to the
    // identical copy early enough that the player never sees an empty edge.
    if (moving && grid.scrollLeft < slotWidth * 2) grid.scrollLeft += keys.length * slotWidth;
    else if (moving && grid.scrollLeft > grid.scrollWidth - grid.clientWidth - slotWidth * 2) grid.scrollLeft -= keys.length * slotWidth;
    const center = grid.scrollLeft + grid.clientWidth / 2;
    const current = nearest();
    items.forEach(({ slot, tile }, index) => {
      const distance = ((index + .5) * slotWidth - center) / slotWidth;
      const magnitude = Math.abs(distance);
      // Fixed slots may overlap visually; the nearest item always paints on top.
      slot.style.zIndex = Math.max(0, 100 - Math.round(magnitude * 10));
      // Depth comes from dimming rather than transparency, so overlapping covers stay
      // solid; only the outermost ones fade into the rail edges.
      const reach = Math.min(magnitude, 1);
      tile.style.setProperty('--cover-scale', Math.max(.58, 1 - magnitude * .14 - reach * .06));
      tile.style.setProperty('--cover-dim', Math.max(.42, 1 - magnitude * .16 - reach * .12));
      tile.style.setProperty('--cover-opacity', Math.max(0, Math.min(1, 4.6 - magnitude)));
      if (reducedMotion()) {
        tile.style.setProperty('--cover-angle', '0deg');
        tile.style.setProperty('--cover-shift', '0px');
      } else {
        // Neighbors swing in quickly, then hold their angle like a coverflow stack.
        tile.style.setProperty('--cover-angle', `${-Math.sign(distance) * Math.min(42, magnitude * 42)}deg`);
        tile.style.setProperty('--cover-shift', `${-Math.sign(distance) * Math.min(magnitude, 3) * slotWidth * .06}px`);
      }
      slot.classList.toggle('is-centered', index === current);
    });
    onBrowse(keys[items[current].index]);
  }

  function settle() {
    clearTimeout(settleTimer);
    if (!ready || !grid.clientWidth || touching) return;
    const current = items[nearest()];
    selected = current.index;
    // Recenter the identical middle copy after a wrap, preserving the visual pose.
    const target = offsetFor(keys.length + selected);
    grid.scrollTo({ left: target, behavior: 'instant' });
    moving = false;
    items.forEach(({ tile, index, copy }) => { tile.tabIndex = copy === 1 && index === selected ? 0 : -1; });
    paint();
    const focusedCopy = grid.contains(document.activeElement) && document.activeElement.getAttribute('aria-hidden') === 'true';
    if (focusAfterScroll || focusedCopy) items[keys.length + selected].tile.focus({ preventScroll: true });
    focusAfterScroll = false;
    onSelect(keys[selected]);
  }

  function center(value, { animate = false, focus = false } = {}) {
    selected = Math.max(0, keys.indexOf(value));
    if (!grid.clientWidth) return;
    ready = true;
    focusAfterScroll = focus;
    let targetIndex = keys.length + selected;
    if (animate) {
      // The closest copy also makes next/previous across the ends a single step.
      const candidates = [selected, keys.length + selected, keys.length * 2 + selected];
      targetIndex = candidates.reduce((best, index) => Math.abs(offsetFor(index) - grid.scrollLeft) < Math.abs(offsetFor(best) - grid.scrollLeft) ? index : best, targetIndex);
    }
    moving = animate && !reducedMotion();
    grid.scrollTo({ left: offsetFor(targetIndex), behavior: moving ? 'smooth' : 'instant' });
    if (moving) settleTimer = setTimeout(settle, 220);
    else settle();
  }

  function advance(direction, focus = false) {
    onActivate();
    const current = ready ? items[nearest()].index : selected;
    center(keys[(current + direction + keys.length) % keys.length], { animate: true, focus });
  }

  grid.addEventListener('scroll', () => {
    if (!ready) return;
    moving = true;
    if (!frame) frame = requestAnimationFrame(paint);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 160);
  }, { passive: true });
  grid.addEventListener('scrollend', () => { if (moving) settle(); });
  grid.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  const releaseTouch = () => {
    touching = false;
    clearTimeout(settleTimer);
    if (moving) settleTimer = setTimeout(settle, 160);
  };
  grid.addEventListener('touchend', releaseTouch, { passive: true });
  grid.addEventListener('touchcancel', releaseTouch, { passive: true });
  grid.addEventListener('pointerdown', () => {
    onActivate();
    focusAfterScroll = false;
  });
  grid.addEventListener('wheel', onActivate, { passive: true });
  grid.addEventListener('click', event => {
    const tile = event.target.closest('.crest-tile');
    if (!tile) return;
    onActivate();
    center(tile.dataset.value, { animate: true });
  });
  grid.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') advance(event.key === 'ArrowLeft' ? -1 : 1, true);
      else center(event.key === 'Home' ? keys[0] : keys.at(-1), { animate: true, focus: true });
    }
  });
  grid.addEventListener('focusin', event => {
    if (event.target.matches(':focus-visible')) onActivate();
  });

  return { center, advance, paint, value: () => keys[selected] };
}
