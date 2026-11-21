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

// A departure frees the player's followers and removes them from other empires' undo history.
export function departurePlan(captures, key) {
  const update = {};
  Object.entries(captures).forEach(([id, c]) => {
    const path = `captures/${id}`;
    if (id === key || (c && c.leader === key)) {
      update[path] = null;
      return;
    }
    if (!c) return;
    const history = [c.via, ...(c.back ? c.back.split(SEP) : [])];
    if (!history.includes(key)) return;
    const [via = id, ...back] = history.filter(via => via !== key);
    update[path] = back.length ? { leader: c.leader, via, back: back.join(SEP) } : { leader: c.leader, via };
  });
  return update;
}

// Recheck each record in the transaction: a follower may have changed empires since this
// page last heard. Rewriting from that old copy would lose the newer capture and its history.
// The rules let only room members delete records.
function cleanDeparture(room, captures, key) {
  // An empty local cache (null) is retried against the server.
  // Stale history can fail validation. The deletion trigger repairs it, so cleanup failure
  // must not block leaving or report a successful removal as refused.
  return Promise.allSettled(Object.keys(captures).map(id => {
    const path = `captures/${id}`;
    return room.child(path).transaction(c => c ? departurePlan({ [id]: c }, key)[path] : null);
  }));
}

// key leaves the room, writing rest (their own entries). Their records go first, while key is
// still a member; removing yourself is never refused.
export async function writeLeave(room, captures, key, rest) {
  await cleanDeparture(room, captures, key);
  await room.update(rest);
}

// Another member removes key, writing rest. The removal can be refused (key came back online),
// so key's records go only once it has gone through.
export async function writeRemoval(room, captures, key, rest) {
  await room.update(rest);
  await cleanDeparture(room, captures, key);
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

// Clear those records before a capture or claim, each only while it is still the record this
// page judged: another page may have confirmed a newer capture since this one last heard. A
// record that stays makes the rules refuse the write that follows.
export function clearStaleCaptures(room, captures, users, keys) {
  return Promise.allSettled(Object.keys(staleCaptures(captures, users, keys)).map(path => {
    const seen = captures[path.slice('captures/'.length)];
    // An empty local cache (null) is retried against the server.
    return room.child(path).transaction(c =>
      (c && (c.leader !== seen.leader || c.via !== seen.via || c.back !== seen.back) ? undefined : null));
  }));
}

// Updates for undoing key's capture: key goes free and the followers that moved with them
// return to their previous empire. Records without history (older rooms) go free.
export function releasePlan(captures, key, users) {
  const update = {};
  Object.entries(captures).forEach(([id, c]) => {
    if (!c || c.via !== key) return;
    if (id === key || !c.back || (users && (!users[id] || !users[key]))) {
      update[`captures/${id}`] = null;
      return;
    }
    const [via = id, ...rest] = c.back.split(SEP).filter(via => !users || users[via]);
    update[`captures/${id}`] = rest.length ? { leader: key, via, back: rest.join(SEP) } : { leader: key, via };
  });
  return update;
}
