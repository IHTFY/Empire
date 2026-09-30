// One player can have several tabs/sockets. Legacy entries remain readable until their
// browser reloads; v2 online/away state comes solely from the active connection entries.
export function summarizePresence(entry) {
  if (!entry || entry.version !== 2) return entry;
  const connections = Object.values(entry.connections || {});
  return {
    ...entry,
    online: connections.length > 0,
    away: connections.length > 0 && connections.every(connection => connection.away),
    name: connections.find(connection => connection.name)?.name || entry.name
  };
}
