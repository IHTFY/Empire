import { AWAY_AFTER_MS } from './config.js';

// Owns one room connection and its away timer; the room controller owns subscription cleanup.
export function createRoomPresence({ db, getRoom, getUid, listen }) {
  let presenceRef = null;
  let presenceConnection = null;
  let awayTimer = null;

  function stopPresence() {
    const ref = presenceRef;
    const connection = presenceConnection;
    presenceRef = presenceConnection = null;
    clearTimeout(awayTimer);
    if (!ref) return Promise.resolve();
    // Remove our entry before canceling the disconnect hook, including when reentering a room.
    const remove = connection ? ref.update({ [`connections/${connection.key}`]: null, lastSeen: firebase.database.ServerValue.TIMESTAMP }) : Promise.resolve();
    return remove.then(() => ref.onDisconnect().cancel()).catch(err => console.error(err));
  }

  function startPresence() {
    presenceRef = db.ref(`games/${getRoom().id}/presence/${getUid()}`);
    const ref = presenceRef;
    listen(db.ref('.info/connected'), async snapshot => {
      if (snapshot.val() !== true || ref !== presenceRef) return;
      const connection = ref.child('connections').push();
      presenceConnection = connection;
      const name = (localStorage.getItem('realName') || 'Guest').slice(0, 100);
      try {
        // Establish the schema before registering a multi-path disconnect write. No online
        // entry is published until its cleanup is registered.
        await ref.update({ version: 2, name, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        if (ref !== presenceRef || presenceConnection !== connection) return;
        await ref.onDisconnect().update({ version: 2, [`connections/${connection.key}`]: null, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        if (ref !== presenceRef || presenceConnection !== connection) return;
        await connection.set({ away: document.hidden, name });
        if (ref !== presenceRef) await ref.update({ [`connections/${connection.key}`]: null, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      } catch (err) { console.error(err); }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!presenceConnection) return;
    clearTimeout(awayTimer);
    const connection = presenceConnection;
    if (document.hidden) {
      awayTimer = setTimeout(() => {
        if (connection === presenceConnection) connection.update({ away: true }).catch(() => {});
      }, AWAY_AFTER_MS);
    } else {
      connection.update({ away: false }).catch(() => {});
    }
  });

  function setName(name) {
    if (presenceConnection) presenceConnection.update({ name }).catch(() => {});
  }

  return { start: startPresence, stop: stopPresence, setName };
}
