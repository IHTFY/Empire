// Device storage that never throws. A browser can refuse localStorage outright (all site data
// blocked, a sandboxed frame, a full quota), and no saved preference is worth a failed start.
export function readStored(key) {
  try { return localStorage.getItem(key); } catch (err) { return null; }
}

export function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch (err) { /* blocked or full: the choice lasts until the page closes */ }
}

export function removeStored(key) {
  try { localStorage.removeItem(key); } catch (err) { /* blocked */ }
}
