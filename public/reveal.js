import { $ } from './dom.js';
import { COUNTDOWN_MS, NAME_MS } from './config.js';
import { crestSvg, botCrest, initialOf } from './crest.js';

// Owns synchronized playback, its cancellation token, and the bot announcement queue.
export function createReveal({ db, flashNames, getRoom, audio, ui, refreshLobby }) {
  const startButton = $('revealSecrets');
  let revealing = false;
  let revealRun = 0;
  const { toast } = ui;

  startButton.addEventListener('click', async () => {
    if (startButton.classList.contains('is-disabled')) {
      if (Object.keys(getRoom().users).length < 2) toast('You need at least 2 players. Add a bot or share the link.');
      return;
    }
    const spinner = startButton.querySelector('.spinner');
    spinner.hidden = false;
    startButton.classList.add('is-disabled');

    try {
      await flashNames({ text: getRoom().id });
    } catch (err) {
      toast(err.message);
    } finally {
      spinner.hidden = true;
      refreshLobby();
    }
  });

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Long names shrink from their styled size to stay on one line; only very long ones wrap.
  function fitWord(word, box) {
    const room = box.clientWidth - 56;
    let size = Math.round(parseFloat(getComputedStyle(word).fontSize) / 4) * 4;
    while (word.scrollWidth > room && size > 36) {
      size -= 4;
      word.style.fontSize = `${size}px`;
    }
    if (word.scrollWidth > room) word.classList.add('wrap');
  }

  // Everyone follows the server's clock: startedAt is a server timestamp, so a player who
  // reloads or arrives mid-reveal joins at the current name instead of getting a replay.
  let serverOffset = 0;
  db.ref('.info/serverTimeOffset').on('value', snap => { serverOffset = snap.val() || 0; });
  const serverNow = () => Date.now() + serverOffset;

  function showStep(stage, timer, bar, step, into, names) {
    if (step < 3) {
      timer.hidden = true;
      stage.innerHTML = `<div class="count"><span class="count-burst"></span><span class="count-num display">${3 - step}</span></div>`;
      if (into < 250) audio.tick(step === 2 ? 880 : 660);
      return;
    }
    const name = names[step - 3];
    const word = document.createElement('div');
    word.className = 'reveal-name display';
    word.textContent = name;
    stage.replaceChildren(word);
    fitWord(word, stage);
    timer.hidden = false;
    bar.classList.remove('run');
    void bar.offsetWidth; // restart the timer animation
    bar.style.animationDelay = `${-into}ms`;
    bar.classList.add('run');
  }

  // A removed bot's secret name, shown full screen and spoken. Announcements queue up.
  let announced = new Set();
  let announceQueue = Promise.resolve();
  // Bots' names outlive their removal, so the announcement can say who it was.
  let botNames = {};
  function announceRemoved(key, entry) {
    const code = getRoom().id;
    const botName = botNames[key];
    announceQueue = announceQueue.then(async () => {
      if (getRoom().id !== code) return;
      while (revealing) await sleep(300);
      const screen = $('eliminatedScreen');
      const word = $('eliminatedName');
      $('eliminatedCrest').innerHTML = crestSvg(botCrest(key));
      $('eliminatedWho').textContent = botName ? `Bot · ${botName}` : 'Bot';
      $('eliminatedLabel').textContent = 'was secretly';
      word.textContent = entry.name;
      word.style.fontSize = '';
      word.classList.remove('wrap');
      screen.hidden = false;
      fitWord(word, screen);
      audio.speak(entry.name, entry.voice);
      await sleep(3200);
      screen.hidden = true;
    }).catch(() => { $('eliminatedScreen').hidden = true; });
  }

  // A captured player's empire changes hands: their crest burns into the captor's and
  // the members move across one at a time. Shares the bot queue, so screens never overlap.
  function announceCapture({ name, crest, captor, captorCrest, moved, captorSize }) {
    const code = getRoom().id;
    announceQueue = announceQueue.then(async () => {
      if (getRoom().id !== code) return;
      while (revealing) await sleep(300);
      const screen = $('captureScreen');
      const lost = $('captureLostCrest');
      const lostCount = $('captureLostCount');
      const wonCount = $('captureWonCount');
      const word = $('captureBy');
      const total = moved + 1;
      let left = total;
      let won = captorSize - total;
      const resetCount = (el, value) => {
        el.replaceChildren();
        delete el.dataset.value;
        delete el.dataset.mode;
        ui.rollNumber(el, value);
      };
      lost.className = 'crest-slot capture-crest';
      lost.innerHTML = crestSvg(crest, { letter: initialOf(name) });
      $('captureWonCrest').innerHTML = crestSvg(captorCrest, { letter: initialOf(captor) });
      resetCount(lostCount, left);
      resetCount(wonCount, won);
      lostCount.classList.remove('is-empty');
      $('captureWho').textContent = name;
      word.textContent = captor;
      word.style.fontSize = '';
      word.classList.remove('wrap');
      screen.hidden = false;
      fitWord(word, screen);
      await sleep(1100);
      // The crest flares, then snaps into the captor's colors at the height of the burn.
      lost.classList.add('burning');
      await sleep(380);
      lost.innerHTML = crestSvg(captorCrest, { letter: initialOf(name) });
      await sleep(520);
      const step = Math.max(110, Math.min(420, 1400 / total));
      while (left > 0) {
        left--;
        won++;
        ui.rollNumber(lostCount, left);
        ui.rollNumber(wonCount, won);
        $('captureWonCrest').classList.remove('gain');
        void $('captureWonCrest').offsetWidth;
        $('captureWonCrest').classList.add('gain');
        audio.tick(520 + 40 * Math.min(won, 12));
        await sleep(step);
      }
      lostCount.classList.add('is-empty');
      audio.chime();
      await sleep(1500);
      screen.hidden = true;
    }).catch(() => { $('captureScreen').hidden = true; });
  }

  // Releases everything one playback holds. Safe to repeat; only the attempt that set
  // `revealing` ever calls it, and no newer attempt can start until it has.
  function releasePlayback(held) {
    if (held.voiceRef) held.voiceRef.off('value', held.onVoice);
    held.voiceRef = null;
    audio.clearClips();
    revealing = false;
    $('revealScreen').hidden = true;
    $('revealStage').innerHTML = '';
    $('revealBar').classList.remove('run');
  }

  async function displaySecrets() {
    if (revealing) return;
    revealing = true;
    const run = ++revealRun;
    const held = { voiceRef: null, onVoice: null };
    try {
      await playReveal(run, held);
    } catch (err) {
      // A failed read or listener must not leave the lobby thinking a reveal is still running.
      releasePlayback(held);
      refreshLobby();
      throw err;
    }
  }

  async function playReveal(run, held) {
    const code = getRoom().id;
    const [namesSnap, startSnap, replaySnap] = await Promise.all([
      db.ref(`games/${code}/names`).once('value'),
      db.ref(`games/${code}/startedAt`).once('value'),
      db.ref(`games/${code}/replay`).once('value')
    ]);
    const canonical = namesSnap.val() || [];
    const replay = replaySnap.val();
    const indexes = replay ? Object.values(replay.indexes || {}) : canonical.map((name, i) => i);
    const names = indexes.map(i => canonical[i]);
    const startedAt = startSnap.val() || serverNow();
    const countdown = 3 * COUNTDOWN_MS;
    const total = countdown + names.length * NAME_MS;
    const stillHere = () => {
      const room = getRoom();
      return room.id === code && room.state === 'playing' && run === revealRun;
    };

    const reveal = $('revealScreen');
    const stage = $('revealStage');
    const timer = $('revealTimer');
    const bar = $('revealBar');
    bar.style.setProperty('--t', `${NAME_MS}ms`);

    // Recorded names arrive during the countdown; decode each as soon as it lands.
    const clips = [];
    const voiceRef = db.ref(`games/${code}/voice`);
    const onVoice = snap => {
      const value = snap.val() || {};
      Object.keys(value).forEach(i => {
        clips[i] = value[i];
        if (audio.isVoiceEnabled()) audio.decodeClip(value[i]);
      });
    };
    voiceRef.on('value', onVoice, () => {});
    held.voiceRef = voiceRef;
    held.onVoice = onVoice;

    let shown = -1;
    let spoken = -1;
    while (stillHere()) {
      const t = serverNow() - startedAt;
      if (t >= total) break;
      const step = t < countdown ? Math.floor(t / COUNTDOWN_MS) : 3 + Math.floor((t - countdown) / NAME_MS);
      if (step !== shown) {
        if (shown === -1) {
          document.querySelectorAll('dialog[open]').forEach(d => d.close());
          reveal.hidden = false;
        }
        shown = step;
        const stepStart = step < 3 ? step * COUNTDOWN_MS : countdown + (step - 3) * NAME_MS;
        showStep(stage, timer, bar, step, t - stepStart, names);
      }
      // Each name is spoken as it appears.
      const spokenT = t - countdown;
      if (spokenT >= 0) {
        const i = Math.floor(spokenT / NAME_MS);
        if (i !== spoken && i < names.length) {
          spoken = i;
          if (spokenT - i * NAME_MS < 800) audio.speak(names[i], clips[indexes[i]]);
        }
      }
      await sleep(60);
    }

    releasePlayback(held);
    // The reveal is over (or was already over when this player arrived).
    // The rules check the server's clock, which can be slightly behind this device's estimate,
    // so retry briefly instead of leaving the room stuck in playing.
    if (stillHere() && serverNow() - startedAt >= total) {
      (async () => {
        for (let attempt = 0; attempt < 5 && stillHere(); attempt++) {
          try {
            await db.ref(`games/${code}/state`).set('waiting');
            return;
          } catch (err) {
            await sleep(1000);
          }
        }
      })();
    }
    refreshLobby();
    if (getRoom().id && getRoom().state === 'playing' && run !== revealRun) displaySecrets();
  }

  let firstEliminated = true;
  function resetAnnouncements() {
    announced = new Set();
    firstEliminated = true;
  }
  function rememberBots(users) {
    Object.entries(users).forEach(([id, user]) => { if (user.fakeBadge) botNames[id] = user.real; });
  }
  function observeEliminated(snapshot) {
    const all = snapshot.val() || {};
    Object.keys(all).forEach(key => {
      const entry = all[key];
      if (!entry || typeof entry !== 'object' || announced.has(key)) return;
      announced.add(key);
      // Only announce fresh removals, not ones that happened before this device joined.
      if (!firstEliminated || serverNow() - entry.at < 15000) announceRemoved(key, entry);
    });
    firstEliminated = false;
  }

  return {
    play: displaySecrets,
    cancel: () => { revealRun++; },
    isRevealing: () => revealing,
    resetAnnouncements,
    rememberBots,
    observeEliminated,
    announceCapture
  };
}
