import { $ } from './dom.js';
import { MAX_PLAYERS } from './config.js';

// Owns lazily loaded word lists and bot creation.
export function createBots({ db, getRoom, getUid, toast }) {
  let fakeNameList = [];
  let fakeSecretList = [];
  let pendingLists = null;
  let adding = false;

  async function populateList(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}`);
    const text = await response.text();
    return text.split('\n').map(line => line.trim()).filter(Boolean);
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async function wordList() {
    if (fakeSecretList.length === 0) fakeSecretList = await populateList('words.txt');
    return fakeSecretList;
  }

  // Concurrent clicks share one request, and a failed one can be retried.
  function loadLists() {
    pendingLists ??= (async () => {
      if (fakeNameList.length === 0) fakeNameList = await populateList('names.txt');
      await wordList();
    })().finally(() => { pendingLists = null; });
    return pendingLists;
  }

  // Whether this player can still add a bot to the room the click started in.
  function canAdd(code) {
    const room = getRoom();
    return room.id === code && room.state === 'waiting' && !room.locked
      && Boolean(room.users[getUid()]) && Object.keys(room.users).length < MAX_PLAYERS;
  }

  $('generateName').addEventListener('click', async () => {
    const code = getRoom().id;
    if (!code || adding) return;
    if (getRoom().locked) {
      toast('The room is locked until the next round.');
      return;
    }
    adding = true;
    try {
      try {
        await loadLists();
      } catch {
        if (canAdd(code)) toast('Could not load the bot names. Try again.');
        return;
      }
      // The player may have switched rooms, or the room may have locked or filled, meanwhile.
      if (!canAdd(code)) return;
      const fakeName = pickRandom(fakeNameList);
      const fakeSecret = pickRandom(fakeSecretList);
      const fakeID = db.ref(`games/${code}/users`).push().key;

      // add the fake player and their secret together
      try {
        await db.ref(`games/${code}`).update({
          [`users/${fakeID}`]: { game: code, real: fakeName, clan: fakeName, fakeBadge: true },
          [`secrets/${fakeID}`]: fakeSecret
        });
      } catch {
        if (getRoom().id === code) toast('Could not add the bot. Try again.');
      }
    } finally {
      adding = false;
    }
  });

  return { wordList, pickRandom };
}
