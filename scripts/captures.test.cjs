const assert = require('node:assert/strict');
const { test } = require('node:test');

const users = keys => Object.fromEntries(keys.map(key => [key, { real: key, clan: key }]));

test('a leader who leaves frees their followers in the data, not only on screen', async () => {
  const { departurePlan } = await import('../public/captures.js');
  const captures = { fay: { leader: 'lea', via: 'fay' }, gus: { leader: 'lea', via: 'fay', back: 'gus' }, yan: { leader: 'zed', via: 'yan' } };
  assert.deepEqual(departurePlan(captures, 'lea'), { 'captures/fay': null, 'captures/gus': null });
  // A captured player who leaves takes only their own record.
  assert.deepEqual(departurePlan(captures, 'yan'), { 'captures/yan': null });
  assert.deepEqual(departurePlan(captures, 'zed'), { 'captures/yan': null });
});

test('a capture or claim clears the records of its players that the lobby already ignores', async () => {
  const { staleCaptures } = await import('../public/captures.js');
  const captures = {
    fay: { leader: 'lea', via: 'fay' }, // Lea left on an older page
    yan: { leader: 'kim', via: 'yan' }, // Kim was captured into Zed at the same moment
    kim: { leader: 'zed', via: 'kim' },
    ola: { leader: 'zed', via: 'ola' }
  };
  const room = users(['fay', 'yan', 'kim', 'ola', 'zed']);
  assert.deepEqual(staleCaptures(captures, room, ['fay', 'yan']), { 'captures/fay': null, 'captures/yan': null });
  // Live records and players outside the write are left alone.
  assert.deepEqual(staleCaptures(captures, room, ['kim', 'ola', 'zed']), {});
});
