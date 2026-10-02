const assert = require('node:assert/strict');
const { test } = require('node:test');

const layout = { S: 52, disc: 78 };
const desired = () => 84;

test('a leader grows when its seat has room', async () => {
  const { tableAvatarSizes } = await import('../public/lobby/crest-sizing.js');
  const players = [{ key: 'leader', capturable: true }, { key: 'other', capturable: true }];
  const seats = new Map([['leader', { a: 0, R: 132 }], ['other', { a: 180, R: 132 }]]);
  const sizes = tableAvatarSizes(players, seats, layout, player => player.key === 'leader' ? 84 : 52);
  assert.equal(sizes.get('leader'), 84);
  assert.equal(sizes.get('other'), 52);
});

test('neighboring capture and remove touch targets limit growth', async () => {
  const { tableAvatarSizes } = await import('../public/lobby/crest-sizing.js');
  for (const control of ['capturable', 'removable']) {
    const seats = new Map([['leader', { a: 0, R: 132 }], ['other', { a: control === 'capturable' ? 35 : -35, R: 132 }]]);
    const free = tableAvatarSizes([{ key: 'leader' }, { key: 'other' }], seats, layout, desired);
    const sizes = tableAvatarSizes([{ key: 'leader' }, { key: 'other', [control]: true }], seats, layout, desired);
    assert(sizes.get('leader') < free.get('leader'));
    assert(sizes.get('leader') >= layout.S);
  }
});

test('growth respects the stage edge and table center without shrinking ordinary crests', async () => {
  const { tableAvatarSizes } = await import('../public/lobby/crest-sizing.js');
  const players = [{ key: 'leader' }];
  const seats = new Map([['leader', { a: 0, R: 70 }]]);
  assert.equal(tableAvatarSizes(players, seats, { S: 30, disc: 44 }, () => 100).get('leader'), 36);
  seats.set('leader', { a: 0, R: 164 });
  assert.equal(tableAvatarSizes(players, seats, { S: 30, disc: 44 }, () => 100).get('leader'), 46);
  assert.equal(tableAvatarSizes(players, seats, { S: 30, disc: 44 }, () => 30).get('leader'), 30);
});
