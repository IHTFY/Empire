const assert = require('node:assert/strict');
const { test } = require('node:test');

const FALLBACK = "Couldn't start the round. Try again.";

// Mounts the real reveal controller and returns the start button's click handler.
async function mount(flashNames) {
  const elements = new Map();
  let click = null;
  const element = id => ({
    hidden: true, textContent: '', innerHTML: '', style: { setProperty() {} }, dataset: {}, clientWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, handler) { if (id === 'revealSecrets' && type === 'click') click = handler; },
    querySelector: () => element(), replaceChildren() {}
  });
  global.document = { getElementById: id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); }, querySelectorAll: () => [] };
  global.ResizeObserver = class { observe() {} };
  const toasts = [];
  const db = { ref: () => ({ on() {}, off() {} }) };
  const { createReveal } = await import('../public/reveal.js?' + Math.random());
  createReveal({ db, flashNames, getRoom: () => ({ id: 'A', users: { a: {}, b: {} } }), getUid: () => 'a',
    audio: {}, ui: { toast: text => toasts.push(text), rollNumber() {} }, refreshLobby() {} });
  return { click: () => click(), toasts };
}

async function startFailing(error) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const t = await mount(async () => { throw error; });
    await t.click();
    return { toasts: t.toasts, logged };
  } finally {
    console.error = original;
  }
}

test('a missing start function shows a fixed sentence, not the SDK text, and logs the error', async () => {
  const error = Object.assign(new Error('not-found [404]'), { code: 'functions/not-found' });
  const { toasts, logged } = await startFailing(error);
  assert.deepEqual(toasts, [FALLBACK]);
  assert.equal(logged[0][0], error);
});

test('internal and network failures get the fixed sentence', async () => {
  for (const [code, message] of [['functions/internal', 'internal [500]'], ['functions/unavailable', 'unavailable [503]'],
    ['functions/permission-denied', 'permission-denied [403]'], ['functions/unauthenticated', 'Unauthenticated [401]'],
    ['functions/invalid-argument', 'Invalid game code. [400]']]) {
    const { toasts } = await startFailing(Object.assign(new Error(message), { code }));
    assert.deepEqual(toasts, [FALLBACK], message);
  }
  assert.deepEqual((await startFailing(new TypeError('Failed to fetch'))).toasts, [FALLBACK]);
});

test('messages the start function writes for players still reach them, without the status suffix', async () => {
  for (const [code, message, shown] of [
    ['functions/failed-precondition', 'You need at least 2 players to start. [400]', 'You need at least 2 players to start.'],
    ['functions/permission-denied', 'You are not in this game. [403]', 'You are not in this game.'],
    ['functions/unauthenticated', 'Sign in to start a game. [401]', 'Sign in to start a game.']]) {
    const { toasts } = await startFailing(Object.assign(new Error(message), { code }));
    assert.deepEqual(toasts, [shown]);
  }
});
