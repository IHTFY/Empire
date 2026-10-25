// The ad on the home screen comes from the shared IHTFY loader, which ihtfy.com serves
// for all the games (its source is in the IHTFY/com.ihtfy repo). Nothing ad-related loads
// until a player has finished a round and is back home: the loader arrives then, and
// AdSense after it at browser idle. The one exception is a visitor who may have bought
// ad-free (loadForBuyer): the loader comes at startup so it can hide the ad box before it
// shows. Rooms never show ads: the ad belongs to Home, which is never on screen during a
// room, and it is gone before a dialog opens over it.
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
  if (mayBeAdFree()) load().catch(() => {});
}

function mayBeAdFree() {
  let stored = null;
  try { stored = localStorage.getItem('ihtfy-ad-free'); } catch (err) { /* storage off: the cookie may still hold it */ }
  let cookie = '';
  try { cookie = document.cookie; } catch (err) { /* cookies off too (a sandboxed frame): the page must still start */ }
  return Boolean(stored) || /(?:^|;\s*)ihtfy-ad-free=/.test(cookie);
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

// The round whose ad was taken down because a dialog opened over Home. It gets no second one.
let retiredRound = null;

// Whether Home is on screen. A request that was waiting on the ad-free check when Home closed
// does nothing.
let homeOpen = false;

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

// The sizes the loader offers that Home can use, largest first. The stylesheet sizes the box
// from `data-ad-size`, so the box keeps its size when the window turns.
const SIZES = ['300x250', '320x100', '320x50'];

// Home keeps at least this much height for its title (which hides below 32px), so it still
// looks like itself. The margin covers the text growing when the web fonts replace the fallback.
const MIN_HERO = 40;

// Whether Home, with the box at its current size, still shows the whole form and the hero
// without scrolling. The logo, title and mode panel animate their size, which would have the
// measure read the layout from before the box changed, so animation waits while it measures.
function fits(aside) {
  const page = aside.parentElement;
  page.classList.add('measuring');
  try { return fitsNow(page); } finally { page.classList.remove('measuring'); }
}

function fitsNow(page) {
  const form = page.querySelector('#roomForm');
  return page.scrollHeight <= page.clientHeight && page.scrollWidth <= page.clientWidth
    && form.scrollHeight <= form.clientHeight + 1 && page.querySelector('.hero').clientHeight >= MIN_HERO;
}

// Shows `aside` with the largest box that fits Home and asks for the ad. A window too short for
// even the smallest box gets no ad, and neither does a player who is offline.
function placeHomeAd(aside, box, key) {
  if (!navigator.onLine) return;
  aside.hidden = false;
  // An ad already in the box keeps its size, so a window that has since shrunk takes it down.
  if (box.querySelector('ins.adsbygoogle')) return fits(aside) ? showAd(box, key) : retireHomeAd(aside, box);
  const size = SIZES.find(size => { box.dataset.adSize = size; return fits(aside); });
  if (!size) {
    delete box.dataset.adSize;
    aside.hidden = true;
    return;
  }
  showAd(box, cancels ? `${key}#${cancels}` : key);
}

// Called each time Home opens. The loader asks for one ad per round, so coming back home
// again after the same round asks for no new one. A visitor who may have bought ad-free gets
// no box until the loader has found the stored key invalid.
export function showHomeAd(aside, box) {
  homeOpen = true;
  const key = finishedRound();
  if (!key || key === retiredRound) return;
  if (boxRound !== null && boxRound !== key) box = freshBox(box);
  boxRound = key;
  if (!mayBeAdFree()) return placeHomeAd(aside, box, key);
  load().then(() => window.ihtfyAds.adFree()).then(free => {
    if (!free && homeOpen && key !== retiredRound && box.isConnected) placeHomeAd(aside, box, key);
  }, () => {});
}

// Called when Home closes: a box still waiting for its ad is replaced, so nothing is
// requested inside the hidden screen. A filled box stays for the round.
export function closeHomeAd(box) {
  homeOpen = false;
  if (box.querySelector('ins.adsbygoogle')) return;
  cancels++;
  freshBox(box);
}

// Called when a dialog opens over Home. The ad is taken down rather than left under the
// dialog, and the round gets no other.
export function retireHomeAd(aside, box) {
  if (!homeOpen) return;
  retiredRound = boxRound;
  if (aside.hidden) return;
  if (!box.querySelector('ins.adsbygoogle')) cancels++;
  freshBox(box);
  aside.hidden = true;
}

// Called when what Home holds may have grown: the window resized (phone turned) or the form
// changed (create/join, an error message). A box that no longer fits comes down for good, as
// it can't change size once the loader has it. A window resize while a field has focus is the
// keyboard, which leaves what fits as it was.
export function refitHomeAd(aside, box, resizing = false) {
  if (!homeOpen || aside.hidden) return;
  if (resizing && document.activeElement?.matches('input, textarea')) return;
  if (!fits(aside)) retireHomeAd(aside, box);
}

// Wires the ad to what can happen to Home while it shows: a dialog opening over it, the window
// resizing, and the form changing size. The form's changes are checked once its animation ends.
// The box is looked up each time, as leaving Home can replace it.
export function watchHomeAd(aside, form) {
  const current = () => aside.querySelector('[data-ad-slot]');
  document.addEventListener('sheetopen', () => retireHomeAd(aside, current()));
  window.addEventListener('resize', () => refitHomeAd(aside, current(), true));
  let settle = 0;
  let observing = false;
  const formChanged = new ResizeObserver(() => {
    // The first report is the form as it stands, not a change.
    if (!observing) return void (observing = true);
    clearTimeout(settle);
    settle = setTimeout(() => refitHomeAd(aside, current()), 450);
  });
  for (const part of form.children) formChanged.observe(part);
}
