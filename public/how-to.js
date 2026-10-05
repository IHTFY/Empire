import { crestSvg, parseCrest } from './crest.js';

const [vTable, vHome, vSetup, vLobby, vReveal, homeCard, homeBtn, table, strip, capSheet, revealName, readPill, lobbyTable, prev, next, play, closeTutorial] = ["vTable", "vHome", "vSetup", "vLobby", "vReveal", "homeCard", "homeBtn", "table", "strip", "capSheet", "revealName", "readPill", "lobbyTable", "prev", "next", "play", "closeTutorial"].map(id => document.getElementById(id));

/* ===== cast: you are always Frankie ===== */
const P = {
  frankie: { n: 'Frankie', you: true },
  ana: { n: 'Ana' }, ben: { n: 'Ben' },
  cy: { n: 'Cy' }, dee: { n: 'Dee' },
};
const SEATS = ['frankie', 'ana', 'ben', 'cy', 'dee'];   // clockwise
const SECRETS = { frankie: 'Gandalf', ana: 'Moana', ben: 'Shrek', cy: 'Yoda', dee: 'Elsa' };

/* ===== rules (bottom list). Each rule is shown once; steps point at them ===== */
const RULES = [
  { id: 'goal', sec: 'Goal', t: 'Goal', p: 'Be the leader of the last empire standing. Everyone starts as the leader of their own empire.' },
  { id: 'create', sec: 'Set up', t: 'Create a room', p: 'Tap <strong>Create</strong> and keep the suggested room name or type your own. The room gets a password to share.' },
  { id: 'invite', sec: 'Set up', t: 'Invite friends', p: 'Send them the <strong>Share link</strong>, or have them choose <strong>Join</strong> and enter the room name and password. Short on players? Add bots from the room menu.' },
  { id: 'names', sec: 'Set up', t: 'Pick your names', p: 'Enter your real name and a <strong>secret name</strong> you hope nobody will link to you. Tap your crest to customize it.' },
  { id: 'reveal', sec: 'Set up', t: 'Reveal the names', p: 'Once everyone is in, tap <strong>Reveal the names</strong>. Names lock after the first reveal; anyone who joins later plays the next round.' },
  { id: 'memorize', sec: 'Set up', t: 'Memorize', p: 'The names are read twice, in random order. No recording and no writing them down. Remaining leaders can all agree to hear them again.' },
  { id: 'turns', sec: 'Play', t: 'Take turns', p: 'Go <strong>clockwise</strong> around the group. Only empire <strong>leaders</strong> take turns.' },
  { id: 'guess', sec: 'Play', t: 'Guess', p: 'On your turn, pick another leader and guess their secret name out loud.',
    outs: [['wrong', 'Wrong', 'Your turn ends. The next leader goes.'], ['right', 'Right', 'They and their whole empire join yours. You guess again.']] },
  { id: 'capture', sec: 'Play', t: 'Record captures', p: 'After a right guess, tap the <strong>flag</strong> beside the captured player and pick the leader they joined. Someone in the captured empire confirms. Their crest changes to match, and their whole empire goes with them.' },
  { id: 'members', sec: 'Play', t: 'Empire members', p: 'Members can talk and help protect their leader&#39;s secret name, but only leaders take turns and make official guesses.' },
  { id: 'win', sec: 'Finish', t: 'Win', p: 'The last leader whose secret name has never been guessed wins. Tap <strong>New round</strong> to play again in the same room.' },
];

/* ===== the practice game, step by step ===== */
const ALL_F = { ana: 'frankie', ben: 'frankie', cy: 'frankie', dee: 'frankie' };
const STEPS = [
  { rule: 'goal', view: 'table', strip: { text: '5 players, 5 empires' }, note: 'In this practice game you&#39;re <b>Frankie</b>, playing with Ana, Ben, Cy and Dee.' },
  { rule: 'create', view: 'home', mode: 'create', note: 'Frankie creates the room <b>bold-otter</b>.' },
  { rule: 'invite', view: 'home', mode: 'join', note: 'Ana, Ben, Cy and Dee join <b>bold-otter</b> with its password.' },
  { rule: 'names', view: 'setup', note: 'Frankie&#39;s secret name is <b>Gandalf</b>. Everyone else picks theirs privately.' },
  { rule: 'reveal', view: 'lobby', note: 'All five are in, so Frankie taps <b>Reveal the names</b>.' },
  { rule: 'memorize', view: 'reveal', dur: 9000, note: 'Everyone hears Moana, Shrek, Yoda, Elsa and Gandalf, and each player knows only their own secret name.' },
  { rule: 'turns', view: 'table', turn: 'ana', strip: { who: 'ana', text: 'Ana&#39;s turn', icon: 'cw' }, note: 'Ana goes first. Then it&#39;s Ben, Cy, Dee and Frankie.' },
  { rule: 'guess', view: 'table', out: 'wrong', from: 'ana', to: 'ben', say: 'Ben, is your secret name <em>Yoda</em>?', note: 'Ana tries Ben. Wrong, so her turn ends.' },
  { rule: 'guess', view: 'table', out: 'right', from: 'ben', to: 'cy', flag: 'cy', say: 'Cy, is your secret name <em>Yoda</em>?', note: 'Ben tries Cy. Right! Cy joins Ben&#39;s empire, and Ben guesses again.' },
  { rule: 'capture', view: 'sheet', cap: 'cy', note: 'Ben taps the flag beside Cy and picks Ben. Cy now wears Ben&#39;s crest, and Ben&#39;s empire is 2.' },
  { rule: 'guess', view: 'table', members: { cy: 'ben' }, out: 'wrong', from: 'ben', to: 'dee', say: 'Dee, is your secret name <em>Moana</em>?', note: 'Ben guesses again and tries Dee. Wrong, so his turn ends.' },
  { rule: 'members', view: 'table', members: { cy: 'ben' }, turn: 'dee', hand: ['ben', 'dee'], strip: { who: 'dee', text: 'Dee&#39;s turn. Cy is a member, so Cy is skipped.' }, note: 'Cy would be next, but Cy is in Ben&#39;s empire. Only leaders take turns, so Dee goes.' },
  { rule: 'guess', view: 'table', members: { cy: 'dee', ben: 'dee' }, out: 'right', from: 'dee', to: 'ben', say: 'Ben, is your secret name <em>Shrek</em>?', note: 'Dee tries Ben. Right! Ben and his whole empire, Cy included, join Dee. Dee&#39;s empire is 3.' },
  { rule: 'guess', view: 'table', members: { cy: 'dee', ben: 'dee' }, out: 'wrong', from: 'dee', to: 'ana', say: 'Ana, is your secret name <em>Aragorn</em>?', note: 'Dee guesses again and tries Ana. Wrong, so Dee&#39;s turn ends.' },
  { rule: 'guess', view: 'table', members: { cy: 'dee', ben: 'dee', ana: 'frankie' }, out: 'right', from: 'frankie', to: 'ana', say: 'Ana, is your secret name <em>Moana</em>?', note: 'Frankie&#39;s turn. Right! Ana joins Frankie&#39;s empire, and Frankie guesses again.' },
  { rule: 'guess', view: 'table', members: ALL_F, out: 'right', from: 'frankie', to: 'dee', say: 'Dee, is your secret name <em>Elsa</em>?', note: 'Frankie tries Dee. Right! Dee, Ben and Cy all join Frankie.' },
  { rule: 'win', view: 'table', members: ALL_F, strip: { who: 'frankie', text: 'Frankie is the last leader standing.', stamp: 'win', label: 'Winner' }, note: 'Nobody ever guessed Gandalf, so Frankie wins.' },
];

/* ===== crest shields ===== */
const CRESTS = {
  frankie: 'heater.blue.plain.dragon.gold.riveted',
  ana: 'hoplon.crimson.plain.eagle.silver.basic',
  ben: 'banner.ochre.plain.lion.gold.basic',
  cy: 'peltast.teal.plain.trident.silver.basic',
  dee: 'kite.violet.plain.helm.gold.basic',
};
function crest(key) { return crestSvg(parseCrest(CRESTS[key])); }
function paintCrests(root) {
  root.querySelectorAll('[data-crest]:not([data-done])').forEach(el => { el.dataset.done = 1; el.insertAdjacentHTML('afterbegin', crest(el.dataset.crest)); });
}
const avatar = (key, s, leaderKey, badge, extra = '') => {
  const p = P[key];
  return `<span class="av${p.you ? ' you' : ''}" style="--s:${s}px" data-crest="${leaderKey || key}">${badge > 1 ? `<span class="badge">${badge}</span>` : ''}${extra}</span>`;
};

/* ===== table ===== */
const R = 96, C = 135;
const seatPos = i => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [C + R * Math.cos(a), C + R * Math.sin(a)]; };
function leaderOf(members, k) { return members[k] || k; }
function buildTable(el, step, prevMembers) {
  const members = step.members || {};
  const sizes = {}; SEATS.forEach(k => { const l = leaderOf(members, k); sizes[l] = (sizes[l] || 0) + 1; });
  const seatHtml = SEATS.map((k, i) => {
    const [x, y] = seatPos(i), l = leaderOf(members, k), n = sizes[k] || 0, isMember = l !== k;
    const size = Math.round(46 * (1 + .5 * (1 - 1 / Math.sqrt(n || 1))));
    const changed = prevMembers && leaderOf(prevMembers, k) !== l;
    const cap = step.flag === k ? '<span class="seat-cap"><svg class="icon"><use href="#i-flag"/></svg></span>' : '';
    return `<div class="seat${isMember ? ' member' : ''}${step.from === k || step.turn === k ? ' active' : ''}${changed ? ' flash' : ''}" style="left:${x}px;top:${y - 31}px"><div class="slot">${avatar(k, size, l, n, cap)}</div><span class="seat-name${P[k].you ? ' you' : ''}">${P[k].n}${P[k].you ? ' (you)' : ''}</span></div>`;
  }).join('');
  let arrow = '';
  const pair = step.from ? [step.from, step.to] : step.hand;
  if (pair) {
    const [x1, y1] = seatPos(SEATS.indexOf(pair[0])), [x2, y2] = seatPos(SEATS.indexOf(pair[1]));
    const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d, a = 34, b = 38;
    arrow = `<svg class="arrows" viewBox="0 0 270 270" width="270" height="270"><defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1l8 4-8 4z" fill="currentColor"/></marker></defs><line x1="${x1 + ux * a}" y1="${y1 + uy * a}" x2="${x2 - ux * b}" y2="${y2 - uy * b}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 7" marker-end="url(#ah)"/></svg>`;
  }
  const empires = new Set(SEATS.map(k => leaderOf(members, k))).size;
  el.innerHTML = `<span class="ring-guide"></span><div class="t-center"><b>5</b><span>players</span></div>${seatHtml}${arrow}`;
  paintCrests(el);
  return empires;
}

/* ===== stage ===== */
const views = { table: vTable, home: vHome, setup: vSetup, lobby: vLobby, reveal: vReveal };
let prevMembers = {}, revealTimer = null;
function renderStage(i) {
  const s = STEPS[i];
  const viewKey = s.view === 'sheet' ? 'table' : s.view;
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('on', k === viewKey));
  if (s.view === 'home') { homeCard.dataset.mode = s.mode; homeBtn.textContent = s.mode === 'join' ? 'Join' : 'Create'; }
  if (s.view === 'table' || s.view === 'sheet') {
    const members = s.members || {};
    buildTable(table, { ...s, members }, prevMembers);
    prevMembers = members;
    const st = s.strip || (s.from ? { who: s.from, say: s.say, stamp: s.out, label: s.out === 'wrong' ? 'Wrong' : 'Right' } : null);
    strip.className = 'strip' + (st && s.view === 'table' ? '' : ' empty');
    if (st && s.view === 'table') {
      const who = st.who;
      strip.innerHTML = `${who ? avatar(who, 34, leaderOf(members, who)) : '<span></span>'}<span class="say">${st.say || st.text}</span>${st.stamp ? `<span class="stamp ${st.stamp}">${st.label}</span>` : st.icon ? '<svg class="icon" style="color:var(--gold-hi)"><use href="#i-cw"/></svg>' : '<span></span>'}`;
      paintCrests(strip);
    }
    const sheetOn = s.view === 'sheet';
    table.classList.toggle('dimmed', sheetOn);
    capSheet.classList.toggle('open', sheetOn);
    if (sheetOn) {
      const L = ['frankie', 'ana', 'ben', 'dee'];
      capSheet.innerHTML = `<div class="grip"></div><h4 class="display">Cy was captured?</h4><p>Whose empire have they joined? Their avatar will take on that leader&#39;s crest.</p><div class="leaders">${L.map(k => `<span class="leader-btn${k === 'ben' ? ' pick' : ''}">${P[k].n}${P[k].you ? ' (you)' : ''} · 1</span>`).join('')}</div>`;
    }
  }
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
  if (s.view === 'reveal') {
    const order = ['ana', 'ben', 'cy', 'dee', 'frankie'].map(k => SECRETS[k]);
    const seq = [...order, ...[order[3], order[0], order[4], order[2], order[1]]];
    let n = 0; const tick = () => { revealName.textContent = seq[n % 10]; revealName.style.animation = 'none'; void revealName.offsetWidth; revealName.style.animation = ''; readPill.textContent = n % 10 < 5 ? 'Reading 1 of 2' : 'Reading 2 of 2'; n++; };
    tick(); revealTimer = setInterval(tick, 900);
  }
  // lobby table (static)
  buildTable(lobbyTable, { members: {} }, null);
}

/* ===== rules list ===== */
const rulesEl = document.getElementById('rules');
let lastSec = '';
RULES.forEach(r => {
  if (r.sec !== lastSec) { rulesEl.insertAdjacentHTML('beforeend', `<span class="eyebrow">${r.sec}</span>`); lastSec = r.sec; }
  rulesEl.insertAdjacentHTML('beforeend', `<button type="button" class="rule" data-rule="${r.id}"><h4>${r.t}</h4><p>${r.p}</p>${r.outs ? `<div class="outs">${r.outs.map(o => `<div class="out ${o[0]}"><b>${o[1]}</b><span>${o[2]}</span></div>`).join('')}</div>` : ''}<div class="note"><small>In this game</small><span></span></div></button>`);
});
const ruleEls = Object.fromEntries([...rulesEl.querySelectorAll('.rule')].map(e => [e.dataset.rule, e]));

/* ===== transport ===== */
const ticksEl = document.getElementById('ticks');
const secOf = i => STEPS[i].view === 'home' || STEPS[i].view === 'setup' || STEPS[i].view === 'lobby' || STEPS[i].view === 'reveal' ? 'Set up' : STEPS[i].rule === 'goal' ? 'Goal' : STEPS[i].rule === 'win' ? 'Finish' : 'Play';
STEPS.forEach((s, i) => {
  if (i > 0 && secOf(i) !== secOf(i - 1)) ticksEl.insertAdjacentHTML('beforeend', '<span class="gap"></span>');
  const t = document.createElement('button'); t.className = 'tick'; t.setAttribute('aria-label', `Step ${i + 1}`); t.onclick = () => { pause(); go(i); }; ticksEl.appendChild(t);
});
const tickEls = [...ticksEl.querySelectorAll('.tick')];
let cur = -1, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, ended = false;
const durOf = s => s.dur || 3800 + s.note.length * 28;
function go(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i)); ended = false;
  const s = STEPS[i], ruleChanged = cur < 0 || STEPS[cur].rule !== s.rule;
  cur = i;
  tickEls.forEach((t, k) => { t.classList.toggle('done', k < i); t.classList.remove('active'); });
  void tickEls[i].offsetWidth;
  tickEls[i].style.setProperty('--dur', durOf(s) + 'ms'); tickEls[i].classList.add('active');
  tickEls[i].classList.toggle('manual', !playing);
  document.getElementById('tag').innerHTML = `${secOf(i)} <span>· ${i + 1}/${STEPS.length}</span>`;
  prev.disabled = i === 0; next.disabled = i === STEPS.length - 1;
  Object.entries(ruleEls).forEach(([id, el]) => { el.classList.toggle('on', id === s.rule); });
  const el = ruleEls[s.rule]; el.querySelector('.note span').innerHTML = s.note;
  if (s.rule === 'guess') el.querySelectorAll('.out').forEach(o => o.classList.toggle('hit', o.classList.contains(s.out)));
  const top = Math.max(0, el.offsetTop - (el.previousElementSibling?.classList.contains('eyebrow') ? el.previousElementSibling.offsetHeight + 14 : 2));
  rulesEl.scrollTo({ top, behavior: ruleChanged ? 'smooth' : 'auto' });
  renderStage(i);
  setPlaying(playing);
}
function setPlaying(p) {
  playing = p; ticksEl.style.setProperty('--play', p ? 'running' : 'paused');
  tickEls.forEach(t => t.classList.remove('manual'));
  play.innerHTML = `<svg class="icon"><use href="#${ended ? 'i-replay' : p ? 'i-pause' : 'i-play'}"/></svg>`;
  play.setAttribute('aria-label', ended ? 'Replay' : p ? 'Pause' : 'Play');
}
function pause() { if (playing) setPlaying(false); }
ticksEl.addEventListener('animationend', () => { if (!playing) return; if (cur < STEPS.length - 1) go(cur + 1); else { ended = true; playing = false; setPlaying(false); tickEls[cur].classList.add('done'); } });
play.onclick = () => { if (ended) { playing = true; go(0); } else if (playing) pause(); else { setPlaying(true); } };
prev.onclick = () => { pause(); go(cur - 1); };
next.onclick = () => { pause(); go(cur + 1); };
// touching or scrolling the rules takes over; tapping a rule jumps to its first step
['wheel', 'touchstart', 'pointerdown'].forEach(ev => rulesEl.addEventListener(ev, pause, { passive: true }));
rulesEl.addEventListener('click', e => { const r = e.target.closest('.rule'); if (!r) return; if (STEPS[cur].rule !== r.dataset.rule) go(STEPS.findIndex(s => s.rule === r.dataset.rule)); });
paintCrests(document);
go(0);

const resizeDemo = () => {
  const stage = document.getElementById('stage');
  stage.style.setProperty('--demo-scale', Math.min(1, stage.clientHeight / 358, stage.clientWidth / 334));
};
new ResizeObserver(resizeDemo).observe(document.getElementById('stage'));
closeTutorial.addEventListener('click', () => {
  if (window.parent !== window) window.parent.postMessage('empire:close-tutorial', location.origin);
  else location.href = '/';
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && window.parent !== window) window.parent.postMessage('empire:close-tutorial', location.origin);
});
