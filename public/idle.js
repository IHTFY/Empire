// Pauses the decorative loops (the flowing lava, the home logo's float and halo, the button
// sheen) after 15 seconds without input and while the tab is hidden, so an idle page stops
// repainting. The loops resume on the next input or when the tab is visible again.
const IDLE_AFTER = 15000;
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'];

export function initializeIdle() {
  const root = document.documentElement;
  let timer;
  const sleep = () => root.classList.add('idle');
  const wake = () => {
    root.classList.remove('idle');
    clearTimeout(timer);
    timer = setTimeout(sleep, IDLE_AFTER);
  };
  for (const name of INPUT_EVENTS) window.addEventListener(name, wake, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return wake();
    clearTimeout(timer);
    sleep();
  });
  if (document.hidden) sleep(); else wake();
}
