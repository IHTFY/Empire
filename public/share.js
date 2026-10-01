// Use device sharing when available, otherwise copy the current room link.
export function initializeSharing({ getRoom, roomLink, toast }) {
  document.querySelectorAll('.share-btn').forEach(btn => btn.addEventListener('click', async () => {
    const room = getRoom();
    if (!room.id) return;
    const link = roomLink();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Empire', text: room.pass ? `Join my Empire game: ${room.name} (password ${room.pass})` : `Join my Empire game: ${room.name}`, url: link });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast(link));
  }));
}
