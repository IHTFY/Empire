// The ad on the home screen comes from the shared IHTFY loader, which ihtfy.com serves
// for all the games (its source is in the IHTFY/com.ihtfy repo). Nothing ad-related loads
// until a player has finished a round and is back home: the loader arrives then, and
// AdSense after it at browser idle. Rooms never show ads.
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

// Fills `box` with an ad for the game over named `key`; offline or on failure it stays empty.
function showAd(box, key) {
  if (!navigator.onLine) return;
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
  // A box removed while the loader was on its way would hold the key and block its replacement.
  loader.then(() => box.isConnected && window.ihtfyAds.show(box, key), () => {});
}

// Called each time Home opens. The loader asks for one ad per round, so coming back home
// again after the same round asks for no new one.
export function showHomeAd(aside, box) {
  const key = finishedRound();
  if (!key) return;
  aside.hidden = false;
  showAd(box, key);
}
