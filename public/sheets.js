import { $ } from './dom.js';

// Sheets slide back down (or fade out on wide screens) before they close. The `close`
// event tidies up however the dialog actually closed.
export function closeSheet(dialog) {
  if (!dialog.open || dialog.classList.contains('closing')) return;
  dialog.classList.add('closing');
  const fallback = setTimeout(() => dialog.close(), 400);
  const done = event => {
    if (event.target === dialog && !event.pseudoElement) dialog.close();
  };
  dialog.addEventListener('animationend', done);
  dialog.addEventListener('close', () => {
    clearTimeout(fallback);
    dialog.removeEventListener('animationend', done);
  }, { once: true });
}
export function openSheet(dialog) {
  if (dialog.open) dialog.close();
  if (dialog.id === 'rulesDialog') {
    // Replace the browsing context so a quick reopen cannot target the old document.
    const oldFrame = document.getElementById('tutorialFrame');
    const frame = oldFrame.cloneNode(false);
    frame.src = '/how-to.html';
    oldFrame.replaceWith(frame);
  }
  dialog.showModal();
}

// Bind gestures and delegated sheet buttons once, after the DOM is ready.
export function initializeSheets() {
  const tutorial = document.getElementById('rulesDialog');
  tutorial.addEventListener('close', () => {
    if (!tutorial.open) document.getElementById('tutorialFrame').removeAttribute('src');
  });
  window.addEventListener('message', event => {
    const frame = document.getElementById('tutorialFrame');
    if (event.origin === location.origin && event.source === frame.contentWindow && event.data === 'empire:close-tutorial') closeSheet(tutorial);
  });
  document.querySelectorAll('dialog.sheet').forEach(sheet => {
    sheet.addEventListener('close', () => {
      sheet.classList.remove('closing', 'dragging');
      sheet.style.transform = sheet.style.transition = '';
    });
    // Escape animates like every other way out.
    sheet.addEventListener('cancel', event => {
      event.preventDefault();
      closeSheet(sheet);
    });

    // On phones a sheet can be dragged down to dismiss it, as its grip suggests.
    let drag = null;
    let dragged = false;
    const reset = () => {
      sheet.classList.remove('dragging');
      sheet.style.transition = 'transform .3s var(--ease)';
      sheet.style.transform = '';
      sheet.addEventListener('transitionend', () => { sheet.style.transition = ''; }, { once: true });
    };
    sheet.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || matchMedia('(min-width: 600px)').matches) return;
      if (sheet.classList.contains('closing') || event.target.closest('input, textarea, select')) return;
      // Content that scrolls keeps its own vertical gestures.
      if (event.target.closest('.rules, .crest-options')) return;
      drag = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0, v: 0, active: false };
    });
    sheet.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dy = event.clientY - drag.y;
      if (!drag.active) {
        if (dy < -8) drag = null;
        if (dy <= 8) return;
        drag.active = true;
        sheet.setPointerCapture(event.pointerId);
        sheet.classList.add('dragging');
        sheet.style.transition = 'none';
      }
      const offset = Math.max(0, dy);
      const dt = event.timeStamp - drag.t;
      if (dt > 0) drag.v = (offset - drag.dy) / dt;
      drag.dy = offset;
      drag.t = event.timeStamp;
      sheet.style.transform = `translateY(${offset}px)`;
    });
    const release = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const { active, dy, v } = drag;
      drag = null;
      if (!active) return;
      dragged = true;
      setTimeout(() => { dragged = false; });
      // A quick flick or a pull past a third of the sheet dismisses it; anything less springs back.
      if (event.type === 'pointerup' && (dy > sheet.offsetHeight / 3 || (v > 0.5 && dy > 20))) {
        sheet.classList.remove('dragging');
        sheet.style.transition = '';
        closeSheet(sheet);
      } else {
        reset();
      }
    };
    sheet.addEventListener('pointerup', release);
    sheet.addEventListener('pointercancel', release);
    // The pointer lifting after a drag isn't a tap on whatever it ended over.
    sheet.addEventListener('click', event => {
      if (dragged) {
        event.stopPropagation();
        event.preventDefault();
      }
    }, true);
  });

  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open]');
    if (opener) {
      // Moving from one sheet to another swaps them without the close animation.
      const open = document.querySelector('dialog[open]');
      if (open) open.close();
      openSheet($(opener.dataset.open));
      return;
    }
    if (event.target.closest('[data-close]')) {
      closeSheet(event.target.closest('dialog'));
      return;
    }
    // Tap on the backdrop closes a sheet. The backdrop reports the dialog as its target,
    // so check the tap really landed outside the sheet and not in its padding.
    if (event.target.tagName === 'DIALOG') {
      const r = event.target.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) closeSheet(event.target);
    }
  });
}
