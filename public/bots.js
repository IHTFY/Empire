import { $ } from './dom.js';

// Owns lazily loaded word lists and bot creation.
export function createBots({ db, getRoom, toast }) {
  let fakeNameList = [];
  let fakeSecretList = [];

  async function populateList(url) {
    const response = await fetch(url);
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

  $('generateName').addEventListener('click', async () => {
    if (!getRoom().id) return;
    if (getRoom().locked) {
      toast('The room is locked until the next round.');
      return;
    }
    if (fakeNameList.length === 0) fakeNameList = await populateList('names.txt');
    await wordList();
    const fakeName = pickRandom(fakeNameList);
    const fakeSecret = pickRandom(fakeSecretList);
    const fakeID = db.ref(`games/${getRoom().id}/users`).push().key;

    // add the fake player and their secret together
    await db.ref(`games/${getRoom().id}`).update({
      [`users/${fakeID}`]: { game: getRoom().id, real: fakeName, clan: fakeName, fakeBadge: true },
      [`secrets/${fakeID}`]: fakeSecret
    });
  });

  return { wordList, pickRandom };
}
