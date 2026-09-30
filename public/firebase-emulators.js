// Explicit demo initialization avoids Hosting's generated demo database URL, which can
// differ from the instance where the CLI loaded our rules. Production keeps reserved init.
window.empireFirebaseReady = (async () => {
  if (location.port === '15000') {
    const projectId = 'demo-empire-local';
    const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
    if (!firebase.apps.length) {
      firebase.initializeApp({ apiKey: 'demo-key', projectId,
        authDomain: `${projectId}.firebaseapp.com`, databaseURL });
    }
    const options = firebase.app().options;
    if (options.projectId !== projectId || options.databaseURL !== databaseURL) throw new Error('Local development requires the demo Firebase project and database instance.');
    const host = location.hostname;
    firebase.auth().useEmulator(`http://${host}:19099`, { disableWarnings: true });
    firebase.database().useEmulator(host, 19000);
    firebase.functions().useEmulator(host, 15001);
  } else if (!firebase.apps.length) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/__/firebase/init.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Firebase initialization could not load.'));
      document.head.appendChild(script);
    });
  }
})();
