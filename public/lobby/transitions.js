import { $ } from '../dom.js';

// Owns view preference and transition animations; roster elements and seating stay with the lobby renderer.
export function createLobbyTransitions({ lobby }) {
  let view = localStorage.getItem('lobbyView') === 'list' ? 'list' : 'table';
  // Switching views moves each player as one group. Names and remove controls
  // stay attached to their avatar, and the real player appears only when it lands.
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
    const box = el.getBoundingClientRect();
    if (!rect.width) return box;
    // A Range includes text past an ellipsis. Keep the flying copy inside the
    // same visible name bounds so a long name cannot cover a remove control.
    const left = Math.max(rect.left, box.left), right = Math.min(rect.right, box.right);
    return { left, top: rect.top, width: Math.max(0, right - left), height: rect.height };
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
      shot.set(key, { entry, avatar: entry.avatar, avRect, name, nameRect: textRect(name), xRect: entry.x.hidden ? null : entry.x.getBoundingClientRect(), dim: entry.el.classList.contains('dim') });
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
    // Newly added players may still have an entrance animation in the hidden
    // destination view. Measure their settled position; the morph handles entrance.
    (to === 'table' ? lobby.getSeats() : lobby.getRows()).forEach(entry => entry.el.classList.remove('pop'));
    const after = snapshot(to);
    const layer = document.createElement('div');
    layer.className = 'morph-layer';
    document.body.appendChild(layer);
    const anims = [];
    const hidden = [];
    const startTime = document.timeline.currentTime;
    const run = (el, frames, options) => {
      const animation = el.animate(frames, { fill: 'backwards', ...options });
      animation.startTime = startTime;
      anims.push(animation);
      return animation;
    };
    const glide = 'cubic-bezier(.45, 0, .2, 1)';
    const spring = 'cubic-bezier(.3, 1.4, .5, 1)';
    let last = 0;

    lobby.getOrder().forEach((key, i) => {
      const a = before.get(key), b = after.get(key);
      if (!b) return;
      // Keep a large room's last player from waiting seconds to start moving.
      const delay = i * Math.min(MORPH_STAGGER, 240 / Math.max(1, lobby.getOrder().length - 1));
      last = delay;
      if (to === 'list') {
        // The row's card grows out from behind the landing avatar.
        const r = b.entry.el.getBoundingClientRect(), av = b.avRect;
        const start = `inset(${av.top - r.top}px ${r.right - av.right}px ${r.bottom - av.bottom}px ${av.left - r.left}px round ${av.width / 2}px)`;
        run(b.entry.el, [{ clipPath: start }, { clipPath: 'inset(0px 0px 0px 0px round 16px)' }], { duration: MORPH_MS, delay, easing: glide });
        run(b.entry.el.querySelector('.row-status'), [{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: delay + MORPH_MS });
      }
      if (!a) {
        // A player previously outside the scroll viewport enters as a complete unit.
        run(b.entry.el, [{ opacity: 0 }, { opacity: b.dim ? .55 : 1 }], { duration: 450, delay: delay + 270, easing: glide });
        return;
      }

      const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      const source = center(a.avRect), target = center(b.avRect);
      const group = document.createElement('div');
      group.className = 'morph-player';
      Object.assign(group.style, { left: `${target.x}px`, top: `${target.y}px`, opacity: b.dim ? .55 : 1 });
      layer.appendChild(group);
      const movement = run(group, flightFrames(source.x - target.x, source.y - target.y, 1, 1, 0), { duration: MORPH_MS, delay, fill: 'both' });

      // All parts use the group's path. Only their offsets within the group change
      // as the vertically arranged seat becomes a horizontal list row (or back).
      const attach = (el, sourceRect, targetRect, text = false) => {
        const frames = [];
        const width = targetRect.width || 1, height = targetRect.height || 1;
        Object.assign(el.style, { position: 'absolute', left: '0px', top: '0px', margin: '0', transformOrigin: '0 0' });
        group.appendChild(el);
        for (let j = 0; j <= 24; j++) {
          const t = easeSize(j / 24);
          const x = (sourceRect.left - source.x) * (1 - t) + (targetRect.left - target.x) * t;
          const y = (sourceRect.top - source.y) * (1 - t) + (targetRect.top - target.y) * t;
          const scaleY = sourceRect.height / height + (1 - sourceRect.height / height) * t;
          const scaleX = text ? scaleY : sourceRect.width / width + (1 - sourceRect.width / width) * t;
          const frame = { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})` };
          if (text) frame.width = `${(sourceRect.width * (1 - t) + targetRect.width * t) / scaleX}px`;
          frames.push(frame);
        }
        run(el, frames, { duration: MORPH_MS, delay, fill: 'both' });
      };

      const avatar = b.avatar.cloneNode(true);
      Object.assign(avatar.style, { width: `${b.avRect.width}px`, height: `${b.avRect.height}px`, fontSize: getComputedStyle(b.avatar).fontSize });
      attach(avatar, a.avRect, b.avRect);

      const name = document.createElement('span');
      name.textContent = b.name.textContent;
      const cs = getComputedStyle(b.name);
      ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'color', 'backgroundImage', 'backgroundClip', 'webkitBackgroundClip']
        .forEach(prop => { name.style[prop] = cs[prop]; });
      Object.assign(name.style, { lineHeight: 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      const nameHeight = b.nameRect.height || 1;
      name.style.lineHeight = `${nameHeight}px`;
      name.style.width = `${b.nameRect.width}px`;
      attach(name, a.nameRect, b.nameRect, true);

      const playerHidden = [b.avatar, b.name, b.entry.x];
      if (b.xRect) {
        const button = b.entry.x.cloneNode(true);
        Object.assign(button.style, { width: `${b.xRect.width}px`, height: `${b.xRect.height}px`, zIndex: '2' });
        attach(button, a.xRect || b.xRect, b.xRect);
      }
      playerHidden.forEach(el => { el.style.visibility = 'hidden'; hidden.push(el); });
      movement.onfinish = () => {
        playerHidden.forEach(el => { el.style.visibility = ''; });
        group.remove();
      };
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
