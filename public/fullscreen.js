import { $ } from './dom.js';

// Fullscreen must begin directly from a user action. Unsupported browsers keep the action hidden.
export function initializeFullscreen({ toast }) {
  const buttons = [...document.querySelectorAll('[data-fullscreen]')];
  const update = () => {
    const label = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
    $('fullscreenLabel').textContent = label;
    buttons.forEach(button => {
      button.hidden = !document.fullscreenEnabled;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
    });
  };
  update();
  document.addEventListener('fullscreenchange', update);
  buttons.forEach(button => button.addEventListener('click', async () => {
    buttons.forEach(button => { button.disabled = true; });
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // Close the menu after the request, keeping activation available for the browser.
      $('optionsDialog').close();
    } catch {
      toast('Fullscreen is unavailable in this browser.');
    } finally {
      buttons.forEach(button => { button.disabled = false; });
      update();
    }
  }));
}
