// Capture records are captures/<captured> = { leader, via, back }. via is the player who was
// claimed directly; back lists the vias a follower had before, most recent first, joined by "/"
// (a key never contains one). A single legacy id is a list of one.
const SEP = '/';

// Updates for claiming key into leader's empire. Their followers move along, each remembering
// its whole earlier history so successive undos peel the empires apart in reverse order.
export function capturePlan(captures, key, leader) {
  const update = { [`captures/${key}`]: { leader, via: key } };
  Object.entries(captures).forEach(([id, c]) => {
    if (!c || c.leader !== key) return;
    update[`captures/${id}`] = { leader, via: key, back: c.back ? `${c.via}${SEP}${c.back}` : c.via };
  });
  return update;
}

// Updates for key leaving the room: their own record and those of everyone they lead go, so
// their followers are free in the data as well as on screen.
export function departurePlan(captures, key) {
  const update = {};
  Object.entries(captures).forEach(([id, c]) => {
    if (id === key || (c && c.leader === key)) update[`captures/${id}`] = null;
  });
  return update;
}

// Writes key's departure to room (the games/<code> reference), then rest. The records come
// from this page's copy, which can be out of date: a follower may have joined another empire
// since. Each record is checked again as it is deleted, so only those key still leads go.
// The rules let only room members delete records, so they go before rest, which may remove
// the writer's own entry.
export async function writeDeparture(room, captures, key, rest) {
  const own = `captures/${key}`;
  // An empty local cache (null) is retried against the server.
  await Promise.all(Object.keys(departurePlan(captures, key)).map(path =>
    room.child(path).transaction(c => (path === own || !c || c.leader === key ? null : undefined))));
  await room.update(rest);
}

// Updates that clear the records of keys that the lobby ignores: the player or their leader
// has left, or the leader was captured in the meantime. The rules still count such a record,
// and it would block every capture or claim involving that player.
export function staleCaptures(captures, users, keys) {
  const update = {};
  keys.forEach(id => {
    const c = captures[id];
    if (c && !(users[id] && users[c.leader] && !captures[c.leader])) update[`captures/${id}`] = null;
  });
  return update;
}

// Updates for undoing key's capture: key goes free and the followers that moved with them
// return to their previous empire. Records without history (older rooms) go free.
export function releasePlan(captures, key) {
  const update = {};
  Object.entries(captures).forEach(([id, c]) => {
    if (!c || c.via !== key) return;
    if (id === key || !c.back) {
      update[`captures/${id}`] = null;
      return;
    }
    const [via, ...rest] = c.back.split(SEP);
    update[`captures/${id}`] = rest.length ? { leader: key, via, back: rest.join(SEP) } : { leader: key, via };
  });
  return update;
}
