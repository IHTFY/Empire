// The ad on the home screen comes from the shared IHTFY loader, which ihtfy.com serves
// for all the games (its source is in the IHTFY/com.ihtfy repo). Nothing ad-related loads
// until a player has finished a round and is back home: the loader arrives then, and
// AdSense after it at browser idle. The one exception is a visitor who may have bought
// ad-free (loadForBuyer): the loader comes at startup so it can hide the ad box before it
// shows. Rooms never show ads.
const LOADER = 'https://ihtfy.com/ads/v1.js';

// The last round this tab played in, as "room/round". It lasts for the tab, so ending a
// room (which reloads the page) still shows the ad, and a fresh visit shows none.
const FINISHED_KEY = 'finishedRound';

export function rememberFinishedRound(key) {
  try { sessionStorage.setItem(FINISHED_KEY, key); } catch (err) { /* private mode */ }
}

function finishedRound() {
  try { return sessionStorage.getItem(FINISHED_KEY); } catch (err) { return null; }
}

let loader = null;

function load() {
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = LOADER;
    script.addEventListener('load', resolve);
    script.addEventListener('error', () => {
      script.remove();
      loader = null;
      reject(new Error('The ad loader did not load'));
    });
    document.head.appendChild(script);
  });
  return loader;
}

// Called once at startup. A visitor with an ad-free key (local storage, or the cookie
// ihtfy.com sets) gets the loader right away, which hides the ad box before it appears.
export function loadForBuyer() {
  let stored = null;
  try { stored = localStorage.getItem('ihtfy-ad-free'); } catch (err) { /* storage off: the cookie may still hold it */ }
  if (stored || /(?:^|;\s*)ihtfy-ad-free=/.test(document.cookie)) load().catch(() => {});
}

// Fills `box` with an ad for the game over named `key`; offline or on failure it stays empty.
function showAd(box, key) {
  if (!navigator.onLine) return;
  // A box removed while the loader was on its way would hold the key and block its replacement.
  load().then(() => box.isConnected && window.ihtfyAds.show(box, key), () => {});
}

// The round the current box was set up for. The loader refuses a box that already holds an
// ad, so a new round gets a fresh box.
let boxRound = null;

// How many waiting boxes Home has canceled. The loader holds a round's key until its request
// settles, so a request for a canceled box would block the replacement; after a cancel the
// next request uses a fresh key and the canceled one just exits.
let cancels = 0;

// Swaps `box` for an empty copy. The old one is no longer connected, so ad work still
// waiting on it does nothing.
function freshBox(box) {
  const copy = box.cloneNode(false);
  box.replaceWith(copy);
  return copy;
}

// Called each time Home opens. The loader asks for one ad per round, so coming back home
// again after the same round asks for no new one.
export function showHomeAd(aside, box) {
  const key = finishedRound();
  if (!key) return;
  if (boxRound !== null && boxRound !== key) box = freshBox(box);
  boxRound = key;
  aside.hidden = false;
  showAd(box, cancels ? `${key}#${cancels}` : key);
}

// Called when Home closes: a box still waiting for its ad is replaced, so nothing is
// requested inside the hidden screen. A filled box stays for the round.
export function closeHomeAd(box) {
  if (box.querySelector('ins.adsbygoogle')) return;
  cancels++;
  freshBox(box);
}
