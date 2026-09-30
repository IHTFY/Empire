const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(initial = {}, overrides = {}, globals = {}) {
  const data = structuredClone(initial);
  const clone = value => value === undefined ? null : structuredClone(value);
  const read = target => target.split('/').filter(Boolean).reduce((value, key) => value?.[key], data);
  const write = (target, value) => {
    const parts = target.split('/').filter(Boolean);
    const key = parts.pop();
    let parent = data;
    for (const part of parts) parent = parent[part] ??= {};
    if (value === null) delete parent[key]; else parent[key] = clone(value);
  };
  const snapshot = value => ({ val: () => clone(value), exists: () => value !== null && value !== undefined });
  const ref = (target = '') => ({
    child: key => ref(`${target}/${key}`),
    once: async () => snapshot(clone(read(target))),
    set: async value => write(target, value),
    update: async updates => { Object.entries(updates).forEach(([key, value]) => write(`${target}/${key}`, value)); },
    transaction: async callback => {
      const value = callback(clone(read(target)));
      if (value === undefined) return { committed: false, snapshot: snapshot(clone(read(target))) };
      write(target, value);
      return { committed: true, snapshot: snapshot(clone(read(target))) };
    }
  });
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const functions = {
    https: { onCall: callback => callback, HttpsError },
    database: { instance: () => ({ ref: () => ({ onWrite: callback => callback, onDelete: callback => callback }) }) },
    pubsub: { schedule: () => ({ onRun: callback => callback }) }, logger: { warn: () => {} }
  };
  const context = vm.createContext({ exports: {}, process: { env: {} }, console, setTimeout, clearTimeout, fetch, AbortSignal, require: name => {
    if (name === 'firebase-functions/v1') return functions;
    if (name === 'firebase-admin/app') return { initializeApp: () => ({}), applicationDefault: () => ({}) };
    if (name === 'firebase-admin/database') return { getDatabase: () => globals.database || { ref }, ServerValue: { TIMESTAMP: Date.now() } };
    return require(name);
  }, ...globals });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8'), context);
  Object.entries(overrides).forEach(([name, callback]) => {
    context.override = callback;
    vm.runInContext(`${name} = override`, context);
  });
  return { data, ref, snapshot, exports: context.exports, evaluate: expression => vm.runInContext(expression, context) };
}
module.exports = { harness };
