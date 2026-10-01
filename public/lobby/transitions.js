import { $ } from '../dom.js';

// Owns view preference and transition animations; roster elements and seating stay with the lobby renderer.
export function createLobbyTransitions({ lobby }) {
  let view = localStorage.getItem('lobbyView') === 'list' ? 'list' : 'table';
  // Switching views morphs each player from one layout to the other: copies of their
  // avatar and name swing along curved paths, swelling a little mid-flight, while the
  // real ones wait hidden in their new places.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MORPH_MS = 720;
  const MORPH_STAGGER = 22;
  let morph = null;

  function bezier(x1, y1, x2, y2) {
    const at = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
    return t => {
      let u = t;
      for (let i = 0; i < 8; i++) {
        const slope = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
        if (Math.abs(slope) < 1e-6) break;
        u = Math.min(1, Math.max(0, u - (at(u, x1, x2) - t) / slope));
      }
      return at(u, y1, y2);
    };
  }
  // Horizontal motion leads and vertical motion trails, which bends each path into an arc.
  const easeX = bezier(.15, .75, .3, 1);
  const easeY = bezier(.7, 0, .35, 1);
  const easeSize = bezier(.45, 0, .2, 1);

  function textRect(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    return rect.width ? rect : el.getBoundingClientRect();
  }

  // Where each player's avatar and name sit in a view, skipping rows scrolled out of sight.
  function snapshot(v) {
    const shot = new Map();
    const box = v === 'list' ? $('nameList').getBoundingClientRect() : null;
    (v === 'table' ? lobby.getSeats() : lobby.getRows()).forEach((entry, key) => {
      if (entry.leaving) return;
      const avRect = entry.avatar.getBoundingClientRect();
      if (!avRect.width || (box && (avRect.bottom < box.top || avRect.top > box.bottom))) return;
      const name = v === 'table' ? entry.label : entry.el.querySelector('.row-name');
      shot.set(key, { entry, avatar: entry.avatar, avRect, name, nameRect: textRect(name), dim: entry.el.classList.contains('dim') });
    });
    return shot;
  }

  function flightFrames(dx, dy, s0, s1, swell) {
    const frames = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const scale = (s0 + (s1 - s0) * easeSize(t)) * (1 + swell * Math.sin(Math.PI * t));
      frames.push({ transform: `translate(${dx * (1 - easeX(t))}px, ${dy * (1 - easeY(t))}px) scale(${scale})` });
    }
    return frames;
  }

  // The table's ring and center, left behind as a copy that dissolves outward.
  function tableGhost() {
    const table = $('tableView');
    const rect = table.getBoundingClientRect();
    const ghost = table.cloneNode(true);
    ghost.querySelector('#seats').remove();
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, animation: 'none' });
    return ghost;
  }

  function morphViews(from, to, before, ghost) {
    const after = snapshot(to);
    const layer = document.createElement('div');
    layer.className = 'morph-layer';
    document.body.appendChild(layer);
    const anims = [];
    const hidden = [];
    const run = (el, frames, options) => anims.push(el.animate(frames, { fill: 'backwards', ...options }));
    const glide = 'cubic-bezier(.45, 0, .2, 1)';
    const spring = 'cubic-bezier(.3, 1.4, .5, 1)';
    let last = 0;

    lobby.getOrder().forEach((key, i) => {
      const a = before.get(key), b = after.get(key);
      if (!b) return;
      const delay = i * MORPH_STAGGER;
      last = delay;
      if (to === 'table') run(b.entry.x, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: delay + MORPH_MS });
      if (to === 'list') {
        // The row's card grows out from behind the landing avatar.
        const r = b.entry.el.getBoundingClientRect(), av = b.avRect;
        const start = `inset(${av.top - r.top}px ${r.right - av.right}px ${r.bottom - av.bottom}px ${av.left - r.left}px round ${av.width / 2}px)`;
        run(b.entry.el, [{ clipPath: start }, { clipPath: 'inset(0px 0px 0px 0px round 16px)' }], { duration: 560, delay: delay + 160, easing: glide });
      }
      if (!a) {
        run(b.avatar, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: delay + 300, easing: spring });
        return;
      }

      const size = b.avatar.offsetWidth;
      const avatar = b.avatar.cloneNode(true);
      Object.assign(avatar.style, {
        position: 'fixed', left: `${b.avRect.left + b.avRect.width / 2 - size / 2}px`, top: `${b.avRect.top + b.avRect.height / 2 - size / 2}px`,
        width: `${size}px`, height: `${size}px`, fontSize: getComputedStyle(b.avatar).fontSize, opacity: b.dim ? .55 : 1
      });
      layer.appendChild(avatar);
      const dx = a.avRect.left + a.avRect.width / 2 - (b.avRect.left + b.avRect.width / 2);
      const dy = a.avRect.top + a.avRect.height / 2 - (b.avRect.top + b.avRect.height / 2);
      run(avatar, flightFrames(dx, dy, a.avRect.width / size, b.avRect.width / size, .24), { duration: MORPH_MS, delay, fill: 'both' });

      const name = document.createElement('span');
      name.textContent = b.name.textContent;
      const cs = getComputedStyle(b.name);
      ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'color', 'backgroundImage', 'backgroundClip', 'webkitBackgroundClip']
        .forEach(prop => { name.style[prop] = cs[prop]; });
      Object.assign(name.style, { position: 'fixed', left: `${b.nameRect.left}px`, top: `${b.nameRect.top}px`, lineHeight: 'normal', whiteSpace: 'nowrap', transformOrigin: '0 0', opacity: b.dim ? .55 : 1 });
      layer.appendChild(name);
      const h = name.offsetHeight || 1;
      run(name, flightFrames(a.nameRect.left - b.nameRect.left, a.nameRect.top - b.nameRect.top, a.nameRect.height / h, b.nameRect.height / h, .1), { duration: MORPH_MS, delay, fill: 'both' });

      [b.avatar, b.name].forEach(el => { el.style.visibility = 'hidden'; hidden.push(el); });
    });

    if (to === 'table') {
      run($('tableCenter'), [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 140, easing: spring });
      [...$('ringGuides').children].forEach(g => run(g, [{ opacity: 0, transform: 'scale(1.35)' }, { opacity: g.style.opacity || 1, transform: 'none' }], { duration: 600, easing: glide }));
    } else {
      layer.prepend(ghost);
      ghost.querySelectorAll('.ring-guide').forEach(g => run(g, [{ transform: 'none' }, { opacity: 0, transform: 'scale(1.35)' }], { duration: 450, easing: glide, fill: 'forwards' }));
      const center = ghost.querySelector('.table-center');
      if (center) run(center, [{ transform: 'none' }, { opacity: 0, transform: 'scale(.4)' }], { duration: 380, easing: glide, fill: 'forwards' });
      run($('listSummary'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 120, easing: glide });
    }

    const finish = () => {
      clearTimeout(timer);
      anims.forEach(anim => anim.cancel());
      hidden.forEach(el => { el.style.visibility = ''; });
      layer.remove();
      morph = null;
    };
    const timer = setTimeout(finish, last + MORPH_MS + 260);
    morph = { finish };
  }

  function setView(next) {
    if (morph) morph.finish();
    const from = view;
    const animate = next !== from && !reduceMotion.matches && !$('lobbyScreen').hidden;
    const before = animate ? snapshot(from) : null;
    const ghost = animate && from === 'table' ? tableGhost() : null;
    // The views' own fade-in would shift the landing spots, so it only plays without the morph.
    document.querySelector('.lobby-body').classList.toggle('morphing', animate);
    view = next;
    try { localStorage.setItem('lobbyView', view); } catch (err) { /* private mode */ }
    const toggle = $('viewToggle');
    toggle.classList.toggle('is-list', view === 'list');
    toggle.setAttribute('aria-label', view === 'list' ? 'List view. Show the table' : 'Table view. Show the list');
    $('tableView').hidden = view !== 'table';
    $('listView').hidden = view !== 'list';
    $('listSummary').hidden = view !== 'list';
    if (view === 'table') lobby.fitTable();
    if (animate) morphViews(from, view, before, ghost);
  }
  $('viewToggle').addEventListener('click', () => setView(view === 'table' ? 'list' : 'table'));
  setView(view);

  return { setView };
}
