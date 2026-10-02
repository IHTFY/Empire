function footprint(player, seat, size) {
  const angle = seat.a * Math.PI / 180;
  const x = 195 + Math.sin(angle) * seat.R;
  const y = 195 - Math.cos(angle) * seat.R;
  const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
  const boxes = [box(x - size / 2 - 2, y - size / 2 - 2, size + 4, size + 4)];
  // Include the controls' expanded touch targets, not just their visible circles.
  if (player.capturable || player.direct) boxes.push(box(x - size / 2 - 21, y - size / 2 - 17, 44, 44));
  if (player.removable) boxes.push(box(x + size / 2 - 23, y - size / 2 - 17, 44, 44));
  return boxes;
}

const overlaps = (a, b) => a.left < b.right + 2 && a.right + 2 > b.left && a.top < b.bottom + 2 && a.bottom + 2 > b.top;

export function tableAvatarSizes(players, seats, layout, desiredSize) {
  const sizes = new Map(players.map(player => [player.key, layout.S]));
  const occupied = new Map(players.map(player => [player.key, footprint(player, seats.get(player.key), layout.S)]));
  for (const player of players) {
    const seat = seats.get(player.key);
    // Keep the enlarged crest clear of the center and the edge of the stage.
    const limit = Math.floor(Math.min(desiredSize(player), 2 * (seat.R - layout.disc - 8), 2 * (195 - seat.R - 8)));
    for (let size = limit; size > layout.S; size--) {
      const boxes = footprint(player, seat, size);
      const collision = [...occupied].some(([key, other]) => key !== player.key && boxes.some(box => other.some(target => overlaps(box, target))));
      if (collision) continue;
      sizes.set(player.key, size);
      occupied.set(player.key, boxes);
      break;
    }
  }
  return sizes;
}
