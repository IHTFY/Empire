import { $ } from '../dom.js';
import { MAX_PLAYERS, OFFLINE_KICK_MS } from '../config.js';
import { openSheet } from '../sheets.js';
import { initialOf, botCrest, defaultCrest, parseCrest, crestString, crestSvg } from '../crest.js';
import { createSeating } from './seating.js';

// Owns the stable roster order and player DOM elements. It renders snapshots and delegates database actions.
export function createLobby({ getRoom, getUid, ui, isRevealing, removePlayer, removeWatcher }) {
  const startButton = $('revealSecrets');
  const colors = ['#4F63D9', '#0E8A74', '#B5487A', '#C0662B', '#6D4FC2', '#2E7FB8', '#8A7A12', '#A8433F'];
  const { rollNumber, toast } = ui;
  const seating = createSeating();

  let order = [];
  const seatEls = new Map();
  const rowEls = new Map();

  function resetLobby() {
    order = [];
    seating.reset();
    seatEls.forEach(({ el }) => el.remove());
    rowEls.forEach(({ el }) => el.remove());
    seatEls.clear();
    rowEls.clear();
  }

  function colorFor(key) {
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return colors[hash % colors.length];
  }

  function minutesAgo(time) {
    const minutes = Math.floor((Date.now() - time) / 60000);
    return minutes < 1 ? 'just now' : `${minutes}m ago`;
  }

  function playerInfo(key, user) {
    const seen = getRoom().presence[key];
    const bot = Boolean(user.fakeBadge);
    const you = key === getUid();
    const offline = !bot && seen && seen.online === false;
    const away = !bot && !offline && seen && seen.away;
    let status = bot ? 'Bot' : offline ? `Offline · ${minutesAgo(seen.lastSeen)}` : away ? 'Away' : 'Online';
    if (you) status = 'You';
    return {
      key, bot, you, offline, away,
      name: user.real,
      status,
      color: bot ? '#2B3170' : offline ? '#3A3E63' : colorFor(key),
      crest: bot ? botCrest(key) : user.crest ? parseCrest(user.crest) : defaultCrest(key),
      removable: !you && (bot || (offline && Date.now() - seen.lastSeen > OFFLINE_KICK_MS))
    };
  }

  function avatarHtml() {
    return '<span class="avatar"><span class="crest-slot"></span><span class="initial"></span><svg class="icon bot-icon"><use href="#i-bot" /></svg><span class="dot"></span></span>';
  }

  function paintAvatar(avatar, p, size) {
    avatar.style.background = p.crest ? '' : p.color;
    avatar.classList.toggle('has-crest', Boolean(p.crest));
    const slot = avatar.querySelector('.crest-slot');
    const drawn = p.crest ? [crestString(p.crest), p.name, p.you].join('|') : '';
    if (slot.dataset.drawn !== drawn) {
      slot.dataset.drawn = drawn;
      slot.innerHTML = p.crest ? crestSvg(p.crest, { letter: initialOf(p.name), ring: p.you }) : '';
    }
    if (size) {
      avatar.style.width = `${size}px`;
      avatar.style.height = `${size}px`;
      avatar.style.fontSize = `${Math.round(size * 0.46)}px`;
    }
    avatar.classList.toggle('is-bot', p.bot);
    avatar.classList.toggle('is-offline', p.offline);
    avatar.classList.toggle('is-you', p.you);
    avatar.querySelector('.initial').textContent = p.bot ? '' : [...p.name][0].toUpperCase();
    avatar.querySelector('.bot-icon').style.display = p.bot ? '' : 'none';
    const dot = avatar.querySelector('.dot');
    dot.hidden = p.bot;
    dot.className = `dot${p.away ? ' away' : p.offline ? ' offline' : ''}`;
  }

  function makeRemoveButton(cls) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.innerHTML = '<svg class="icon"><use href="#i-x" /></svg>';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const key = btn.dataset.key;
      const room = getRoom();
      // Once the round has started, removing a bot reveals its secret name, so ask first.
      if (room.locked && room.users[key] && room.users[key].fakeBadge) {
        pendingBotRemoval = key;
        $('removeBotName').textContent = room.users[key].real;
        openSheet($('confirmRemoveBot'));
        return;
      }
      btn.disabled = true;
      removePlayer(key, () => { btn.disabled = false; });
    });
    return btn;
  }

  let pendingBotRemoval = null;
  $('removeBotButton').addEventListener('click', () => {
    if (pendingBotRemoval && getRoom().users[pendingBotRemoval]) removePlayer(pendingBotRemoval);
    pendingBotRemoval = null;
  });
  $('confirmRemoveBot').addEventListener('close', () => { pendingBotRemoval = null; });

  let lastCenter = null;
  document.fonts.ready.then(() => { centerFit = ''; if (lastCenter) fitCenter(...lastCenter); });

  // The stage is scaled to the table's width: down on narrow phones, up on big screens.
  function fitTable() {
    const width = $('tableView').clientWidth;
    if (width > 0) $('tableInner').style.transform = `scale(${width / 390})`;
    if (width > 0 && lastCenter) fitCenter(...lastCenter);
  }
  new ResizeObserver(fitTable).observe($('tableView'));

  function renderLobby() {
    const room = getRoom();
    const uid = getUid();
    if (!room.id) return;
    const entries = Object.entries(room.users).filter(([, user]) => user && user.real);
    const keys = entries.map(([key]) => key);

    // Stable seating order: first seen first; newcomers are added at the end.
    order = order.filter(key => keys.includes(key));
    keys.filter(key => !order.includes(key)).sort().forEach(key => order.push(key));

    const players = order.map(key => playerInfo(key, room.users[key]));
    const count = players.length;
    const waiting = players.filter(p => p.away || p.offline).map(p => p.name);
    const waitingText = waiting.length === 0 ? (count < 2 ? 'Need 2 to start' : 'Everyone is here')
      : waiting.length <= 2 && count <= 11 ? `Waiting for ${waiting.join(', ')}` : `${waiting.length} away`;

    const spectator = !room.users[uid];
    const watchers = Object.entries(room.presence)
      .filter(([key, seen]) => seen && seen.online && !room.users[key])
      .map(([key, seen]) => ({ key, name: key === uid ? 'You' : seen.name || 'Guest' }));
    $('watching').hidden = watchers.length === 0;
    const chips = $('watchingNames');
    chips.replaceChildren(...watchers.map(({ key, name }) => {
      const chip = document.createElement('span');
      chip.className = 'watch-chip';
      chip.textContent = name;
      if (!spectator && key !== uid) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'watch-remove';
        btn.setAttribute('aria-label', `Remove ${name}`);
        btn.textContent = '×';
        btn.addEventListener('click', () => {
          btn.disabled = true;
          removeWatcher(key).catch(() => {
            toast('Could not remove that watcher');
            btn.disabled = false;
          });
        });
        chip.append(btn);
      }
      return chip;
    }));
    $('lockNote').hidden = !spectator && !room.locked;
    $('lockText').textContent = spectator
      ? 'Names are set for this round. You can watch and join at the next round.'
      : 'Names are set for this round. New players can watch and join next round.';
    $('generateName').hidden = spectator;
    document.querySelectorAll('[data-open="confirmNewGame"], [data-open="confirmDelete"]').forEach(button => { button.hidden = spectator; });
    startButton.hidden = spectator;
    $('generateName').classList.toggle('is-disabled', room.locked);
    const preparing = room.state === 'shuffling';
    $('revealLabel').textContent = preparing ? 'Getting voices ready' : room.locked ? 'Read the names again' : 'Reveal the names';
    if (preparing) startButton.querySelector('.spinner').hidden = false;
    $('revealIcon').setAttribute('href', room.locked ? '#i-refresh' : '#i-play');
    startButton.classList.toggle('btn-quiet', room.locked);

    rollNumber($('playerCount'), count);
    $('waitingText').textContent = waitingText;
    $('listSummary').textContent = `${count} player${count === 1 ? '' : 's'} · ${waitingText.toLowerCase()}`;
    startButton.classList.toggle('is-disabled', (!room.locked && count < 2) || isRevealing() || preparing);
    $('generateName').disabled = count >= MAX_PLAYERS;

    renderTable(players);
    renderList(players);
  }

  // The status line sits low in the disc, where the circle narrows: pick the largest
  // size (on an invisible copy, so the real one still animates) that stays inside.
  let centerFit = '';
  function fitCenter(center, L) {
    const wait = center.querySelector('.tc-wait');
    const key = [L.disc, wait.textContent].join('|');
    if (key === centerFit || !center.offsetParent) return; // unchanged, or the table isn't showing
    centerFit = key;

    const probe = center.cloneNode(true);
    probe.removeAttribute('id');
    probe.classList.add('measuring');
    Object.assign(probe.style, { width: `${2 * L.disc}px`, height: `${2 * L.disc}px`, left: '0', top: '0' });
    $('tableInner').appendChild(probe);
    const pWait = probe.querySelector('.tc-wait');

    const r = L.disc - 7;
    const inside = el => {
      const x = el.offsetLeft - L.disc, y = el.offsetTop - L.disc, w = el.offsetWidth, h = el.offsetHeight;
      return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].every(([a, b]) => a * a + b * b <= r * r);
    };
    const apply = (el, o) => Object.assign(el.style, { fontSize: `${o.size}px`, maxWidth: `${o.width}px` });
    const options = [];
    [1.5, 1.35, 1.2].forEach(width => {
      for (let size = L.wait; size >= L.wait * 0.8; size -= 0.5) options.push({ size, width: Math.round(L.disc * width) });
    });
    let chosen = options[options.length - 1];
    for (const o of options) { apply(pWait, o); if (inside(pWait)) { chosen = o; break; } }
    probe.remove();
    apply(wait, chosen);
  }

  function renderTable(players) {
    const { L, seats } = seating.assign(players.map(p => p.key));
    const cx = 195, cy = 195, S = L.S;

    const guides = $('ringGuides');
    while (guides.children.length > L.R.length) guides.lastChild.remove();
    L.R.forEach((R, r) => {
      let g = guides.children[r];
      if (!g) { g = document.createElement('div'); g.className = 'ring-guide'; guides.appendChild(g); }
      Object.assign(g.style, { left: `${cx - R}px`, top: `${cy - R}px`, width: `${2 * R}px`, height: `${2 * R}px`, opacity: String(1 - r * 0.25) });
    });

    const center = $('tableCenter');
    Object.assign(center.style, { left: `${cx - L.disc}px`, top: `${cy - L.disc}px`, width: `${2 * L.disc}px`, height: `${2 * L.disc}px` });
    center.querySelector('.tc-count').style.fontSize = `${L.num}px`;
    center.querySelector('.tc-unit').style.fontSize = `${L.unit}px`;
    lastCenter = [center, L];
    fitCenter(center, L);

    const container = $('seats');
    const live = new Set(players.map(p => p.key));
    seatEls.forEach((entry, key) => {
      if (live.has(key) || entry.leaving) return;
      entry.leaving = true;
      entry.el.classList.remove('pop');
      entry.el.classList.add('gone');
      setTimeout(() => { entry.el.remove(); seatEls.delete(key); }, 420);
    });

    const lh = Math.round(L.f * 1.3);
    players.forEach(p => {
      let entry = seatEls.get(p.key);
      if (entry && entry.leaving) { entry.el.remove(); seatEls.delete(p.key); entry = null; }
      if (!entry) {
        const el = document.createElement('div');
        el.className = 'seat pop';
        el.innerHTML = `<div class="seat-inner">${avatarHtml()}<span class="seat-label"></span></div>`;
        const x = makeRemoveButton('seat-x');
        el.querySelector('.seat-inner').appendChild(x);
        container.appendChild(el);
        setTimeout(() => el.classList.remove('pop'), 600);
        entry = { el, avatar: el.querySelector('.avatar'), label: el.querySelector('.seat-label'), x };
        seatEls.set(p.key, entry);
      }
      const { a, R } = seats.get(p.key);
      const upper = Math.cos((a * Math.PI) / 180) > 0.05;
      entry.el.style.top = `${cy - S / 2}px`;
      entry.el.style.height = `${S}px`;
      entry.el.style.transform = `rotate(${a.toFixed(2)}deg) translateY(${-R}px) rotate(${(-a).toFixed(2)}deg)`;
      entry.el.classList.toggle('dim', p.away || p.offline);
      paintAvatar(entry.avatar, p, S);
      // Names sit on the outer side of each seat so they never cover the center.
      Object.assign(entry.label.style, {
        left: `${36 - L.lw / 2}px`, width: `${L.lw}px`, top: `${upper ? -(lh + 3) : S + 3}px`,
        lineHeight: `${lh}px`, fontSize: `${L.f}px`
      });
      entry.label.textContent = p.name;
      entry.label.classList.toggle('you', p.you);
      entry.x.hidden = !p.removable;
      entry.x.dataset.key = p.key;
      entry.x.setAttribute('aria-label', `Remove ${p.name}`);
      entry.x.style.left = `${36 + S / 2 - 12}px`;
    });
  }

  const rowGap = list => parseFloat(getComputedStyle(list).rowGap) || 0;

  function renderList(players) {
    const list = $('nameList');
    const live = new Set(players.map(p => p.key));
    // Remember where every row is, so rows that shift (when a player leaves or joins)
    // glide to their new place instead of jumping.
    const before = new Map();
    rowEls.forEach(entry => { if (!entry.leaving) before.set(entry.el, entry.el.getBoundingClientRect().top); });
    rowEls.forEach((entry, key) => {
      if (live.has(key) || entry.leaving) return;
      entry.leaving = true;
      // The row burns away in place, so nothing slides under it; only once it's
      // gone does its space close up, carrying the rows below with it.
      const el = entry.el;
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        const collapse = el.animate([
          { height: `${el.offsetHeight}px` },
          { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px', marginBottom: `${-rowGap(list)}px` }
        ], { duration: 260, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
        collapse.onfinish = () => { el.remove(); if (rowEls.get(key) === entry) rowEls.delete(key); };
      };
      el.addEventListener('animationend', e => { if (e.animationName === 'ember') close(); });
      setTimeout(close, 600);
      el.classList.add('gone');
    });
    const liveRows = () => [...list.children].filter(row => !row.classList.contains('gone'));
    players.forEach((p, i) => {
      let entry = rowEls.get(p.key);
      if (entry && entry.leaving) { entry.el.remove(); rowEls.delete(p.key); entry = null; }
      if (!entry) {
        const el = document.createElement('li');
        el.className = 'row pop';
        el.innerHTML = `${avatarHtml()}<span class="row-name"></span><span class="row-status"></span>`;
        const x = makeRemoveButton('row-x');
        el.appendChild(x);
        setTimeout(() => el.classList.remove('pop'), 500);
        entry = { el, avatar: el.querySelector('.avatar'), x };
        rowEls.set(p.key, entry);
      }
      const here = liveRows()[i];
      if (here !== entry.el) list.insertBefore(entry.el, here || null);
      entry.el.classList.toggle('you', p.you);
      entry.el.classList.toggle('offline', p.offline);
      entry.el.classList.toggle('dim', p.away || p.offline);
      paintAvatar(entry.avatar, p);
      entry.el.querySelector('.row-name').textContent = p.name;
      entry.el.querySelector('.row-status').textContent = p.status;
      entry.x.hidden = !p.removable;
      entry.x.dataset.key = p.key;
      entry.x.setAttribute('aria-label', `Remove ${p.name}`);
    });
    before.forEach((top, el) => {
      if (!el.isConnected) return;
      const dy = top - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    });
  }

  return {
    render: renderLobby,
    reset: resetLobby,
    fitTable,
    getOrder: () => order,
    getSeats: () => seatEls,
    getRows: () => rowEls
  };
}
