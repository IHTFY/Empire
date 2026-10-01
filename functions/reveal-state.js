// Every asynchronous write belongs to one reveal attempt. A reset, deletion, or another
// attempt invalidates it, including clips that finish after the readiness deadline.
async function updateReveal(gameRef, revealId, update) {
  return gameRef.transaction(game => {
    if (game === null) return null;
    if (!game || game.revealId !== revealId || !['shuffling', 'playing', 'waiting'].includes(game.state)) return undefined;
    return update(game);
  });
}

module.exports = { updateReveal };
