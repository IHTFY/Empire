const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function harness({ hidden = false } = {}) {
  const windowEvents = {};
  const documentEvents = {};
  const classes = new Set();
  const timers = new Map();
  let nextTimer = 1;
  const context = vm.createContext({
    document: {
      hidden,
      documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
      addEventListener: (name, callback) => { documentEvents[name] = callback; }
    },
    window: { addEventListener: (name, callback, options) => { windowEvents[name] = { callback, options }; } },
    setTimeout: (callback, ms) => { timers.set(nextTimer, { callback, ms }); return nextTimer++; },
    clearTimeout: id => { timers.delete(id); }
  });
  const source = readFileSync(join(__dirname, '../public/idle.js'), 'utf8').replace('export function', 'function');
  vm.runInContext(`${source}\ninitializeIdle();`, context);
  const fire = () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } };
  return { context, windowEvents, documentEvents, classes, timers, fire };
}

test('the page goes idle after 15 seconds without input', () => {
  const { classes, timers, fire } = harness();
  assert.equal(classes.has('idle'), false);
  assert.deepEqual([...timers.values()].map(timer => timer.ms), [15000]);
  fire();
  assert.equal(classes.has('idle'), true);
});

test('input wakes an idle page and restarts the countdown', () => {
  const { classes, windowEvents, timers, fire } = harness();
  fire();
  windowEvents.pointerdown.callback();
  assert.equal(classes.has('idle'), false);
  assert.equal(timers.size, 1);
  windowEvents.pointermove.callback();
  assert.equal(timers.size, 1, 'a new input replaces the pending countdown');
  fire();
  assert.equal(classes.has('idle'), true);
  for (const name of ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel']) assert.equal(windowEvents[name].options.passive, true);
});

test('a hidden tab is idle at once and wakes when visible again', () => {
  const { context, classes, documentEvents, timers } = harness();
  context.document.hidden = true;
  documentEvents.visibilitychange();
  assert.equal(classes.has('idle'), true);
  assert.equal(timers.size, 0);
  context.document.hidden = false;
  documentEvents.visibilitychange();
  assert.equal(classes.has('idle'), false);
  assert.equal(timers.size, 1);
});

test('a page that starts in a hidden tab is idle', () => {
  const { classes, timers } = harness({ hidden: true });
  assert.equal(classes.has('idle'), true);
  assert.equal(timers.size, 0);
});
