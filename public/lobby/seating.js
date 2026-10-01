import { MAX_PLAYERS } from '../config.js';

// Senate table: players sit around the table clockwise; past 11 players a second
// (then third) inner ring opens. Seats per ring are proportional to the ring's size,
// so everyone gets about the same shoulder room, and no ring has fewer than 3.

const LAYOUTS = [
  { R: [132], caps: [11], S: 52, f: 13, lw: 72, disc: 78, room: 15, num: 50, unit: 13, wait: 12 },
  { R: [148, 88], caps: [14, 8], S: 40, f: 11, lw: 64, disc: 56, room: 12, num: 36, unit: 11, wait: 11 },
  { R: [164, 116, 70], caps: [16, 11, 6], S: 30, f: 10, lw: 52, disc: 44, room: 10, num: 26, unit: 10, wait: 10 }
];
const layoutFor = n => LAYOUTS[n <= 11 ? 0 : n <= 22 ? 1 : 2];

function share(n, R, caps) {
  const k = R.length;
  const lo = R.map(() => (k > 1 ? 3 : 0));
  const fixed = R.map(() => null);
  for (;;) {
    const left = n - fixed.reduce((sum, v) => sum + (v || 0), 0);
    const free = R.reduce((sum, r, i) => sum + (fixed[i] === null ? r : 0), 0);
    const ideal = R.map((r, i) => (fixed[i] !== null ? fixed[i] : (left * r) / free));
    const bad = ideal.findIndex((v, i) => fixed[i] === null && (v < lo[i] || v > caps[i]));
    if (bad < 0) {
      const seats = ideal.map(Math.floor);
      let extra = n - seats.reduce((sum, v) => sum + v, 0);
      ideal.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
        .forEach(([, i]) => { if (extra > 0 && seats[i] < caps[i]) { seats[i]++; extra--; } });
      return seats;
    }
    fixed[bad] = ideal[bad] < lo[bad] ? lo[bad] : caps[bad];
  }
}
// Precomputed seats per ring for every room size.
const SEATING = Array.from({ length: MAX_PLAYERS + 1 }, (_, n) => share(n, layoutFor(n).R, layoutFor(n).caps));
const seatsFor = n => (n <= MAX_PLAYERS ? SEATING[n] : share(n, layoutFor(n).R, layoutFor(n).R.map(() => Infinity)));

const norm = a => ((a % 360) + 360) % 360;
const circDist = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, 360 - d); };
function gapMiddle(angles) {
  if (angles.length === 0) return 0;
  const sorted = angles.map(norm).sort((a, b) => a - b);
  let best = 0, mid = sorted[0] + 180;
  sorted.forEach((a, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360;
    if (next - a > best) { best = next - a; mid = a + (next - a) / 2; }
  });
  return mid;
}

// Each lobby owns its placement history; a room change resets it.
export function createSeating() {
  const seatRing = new Map();
  const seatAngle = new Map();
  // Seats stay put where possible: players keep their ring, a ring that is over its
  // share hands the player nearest to the other ring's biggest gap inward/outward (so they
  // move almost straight across), and each ring rotates as little as possible.
  function assignSeats(ids) {
    const n = ids.length;
    const L = layoutFor(n);
    const k = L.R.length;
    const counts = seatsFor(n);
    [...seatRing.keys()].forEach(id => { if (!ids.includes(id)) seatRing.delete(id); });

    const rings = Array.from({ length: k }, () => []);
    const newcomers = [];
    ids.forEach(id => (seatRing.has(id) ? rings[Math.min(seatRing.get(id), k - 1)].push(id) : newcomers.push(id)));
    newcomers.forEach(id => {
      let best = 0, room = -Infinity;
      rings.forEach((m, r) => { if (counts[r] - m.length > room) { room = counts[r] - m.length; best = r; } });
      rings[best].push(id);
    });

    for (;;) {
      const over = rings.findIndex((m, r) => m.length > counts[r]);
      const under = rings.findIndex((m, r) => m.length < counts[r]);
      if (over < 0 || under < 0) break;
      const target = gapMiddle(rings[under].filter(id => seatAngle.has(id)).map(id => seatAngle.get(id)));
      let pick = rings[over][rings[over].length - 1], nearest = Infinity;
      rings[over].forEach(id => {
        const d = seatAngle.has(id) ? circDist(seatAngle.get(id), target) : 360;
        if (d < nearest) { nearest = d; pick = id; }
      });
      rings[over].splice(rings[over].indexOf(pick), 1);
      rings[under].push(pick);
    }

    const seats = new Map();
    rings.forEach((members, r) => {
      const c = members.length;
      if (!c) return;
      const step = 360 / c;
      const known = members.filter(id => seatAngle.has(id));
      members.forEach((id, i) => {
        if (seatAngle.has(id)) return;
        // A first seating goes clockwise in join order; later arrivals take the widest gap.
        seatAngle.set(id, known.length ? gapMiddle(members.filter(m => seatAngle.has(m)).map(m => seatAngle.get(m))) : i * step + (r % 2 ? step / 2 : 0));
      });
      const sorted = members.slice().sort((a, b) => norm(seatAngle.get(a)) - norm(seatAngle.get(b)));
      // Rotate the evenly spaced seats to where people already are (least total movement).
      let sx = 0, sy = 0;
      sorted.forEach((id, j) => {
        const d = ((seatAngle.get(id) - j * step) * Math.PI) / 180;
        sx += Math.cos(d);
        sy += Math.sin(d);
      });
      const offset = sx || sy ? (Math.atan2(sy, sx) * 180) / Math.PI : 0;
      sorted.forEach((id, j) => {
        let a = j * step + offset;
        a += 360 * Math.round((seatAngle.get(id) - a) / 360); // take the short way round
        seatAngle.set(id, a);
        seatRing.set(id, r);
        seats.set(id, { a, R: L.R[r] });
      });
    });
    return { L, seats };
  }
  return { assign: assignSeats, reset: () => { seatRing.clear(); seatAngle.clear(); } };
}
