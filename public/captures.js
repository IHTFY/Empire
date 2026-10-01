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
