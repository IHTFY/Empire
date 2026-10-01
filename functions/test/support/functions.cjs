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
  // Load each CommonJS module in its own scope, just as Node does, while sharing the
  // Firebase fakes. Overrides are installed before importers capture handler references.
  const contexts = new Map();
  const root = path.resolve(__dirname, '../..');
  function loadModule(filename) {
    if (contexts.has(filename)) return contexts.get(filename).module.exports;
    const module = { exports: {} };
    const context = vm.createContext({ module, exports: module.exports,
      process: { env: {} }, console, setTimeout, clearTimeout, fetch, AbortSignal,
      ...globals,
      require: name => {
        if (name === 'firebase-functions/v1') return functions;
        if (name === 'firebase-admin/app') return { initializeApp: () => ({}), applicationDefault: () => ({}) };
        if (name === 'firebase-admin/database') return { getDatabase: () => globals.database || { ref }, ServerValue: { TIMESTAMP: Date.now() } };
        if (name.startsWith('.')) return loadModule(path.resolve(path.dirname(filename), name + '.js'));
        return require(name);
      }
    });
    contexts.set(filename, context);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    for (const [name, callback] of Object.entries(overrides)) {
      if (!Object.hasOwn(module.exports, name)) continue;
      context.override = callback;
      vm.runInContext(`${name} = override`, context);
      module.exports[name] = callback;
      delete context.override;
    }
    return module.exports;
  }
  const exports = loadModule(path.join(root, 'index.js'));
  return {
    data, ref, snapshot, exports,
    voice: loadModule(path.join(root, 'voice.js')),
    updateReveal: loadModule(path.join(root, 'reveal-state.js')).updateReveal
  };
}
module.exports = { harness };
