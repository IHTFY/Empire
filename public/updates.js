// Open tabs and installed apps keep running their loaded bundle until the player reloads.
export function initializeUpdates(currentVersion) {
  const notice = document.getElementById('updateToast');
  const button = document.getElementById('updateApp');
  let checking = false;
  let updating = false;
  let availableVersion = null;
  let dismissedVersion = null;

  document.getElementById('dismissUpdate').addEventListener('click', () => {
    dismissedVersion = availableVersion;
    notice.hidden = true;
  });

  async function check() {
    if (checking || document.hidden || !navigator.onLine) return;
    checking = true;
    try {
      const response = await fetch('/version.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      const { version } = await response.json();
      if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) return;
      availableVersion = version;
      notice.hidden = version === currentVersion || version === dismissedVersion;
    } catch (err) {
      // Offline and failed checks leave the game usable; retry on the next check.
    } finally {
      checking = false;
    }
  }

  button.addEventListener('click', async () => {
    if (updating) return;
    updating = true;
    button.disabled = true;
    button.textContent = 'Updating…';
    try {
      // Confirm connectivity before navigating an installed app to its offline page.
      const response = await fetch('/version.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Update unavailable');
      const { version } = await response.json();
      if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new Error('Update unavailable');
      location.reload();
    } catch (err) {
      document.getElementById('updateMessage').textContent = 'Could not update. Check your connection and try again.';
      button.disabled = false;
      button.textContent = 'Update';
      updating = false;
    }
  });

  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 60000);
  check();
}
