// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions/v1');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');

// Uses the Cloud Functions runtime's default service account credentials.
initializeApp({
  databaseURL: 'https://empire-ihtfy.firebaseio.com'
});

// const db = admin.firestore();
const db = getDatabase();


function shuffle(a) {
  for (let i = 0; i < a.length - 1; i++) {
    let j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// gcloud alpha functions add-iam-policy-binding flashNames --member=allUsers --role=roles/cloudfunctions.invoker
// https://github.com/firebase/functions-samples/issues/395#issuecomment-605025572
exports.flashNames = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to start a game.');
  }

  const gameID = data && data.text;
  if (typeof gameID !== 'string' || !/^[^./#$[\]]{1,128}$/.test(gameID)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid game code.');
  }

  // Only players in the room can start it.
  const member = await db.ref(`games/${gameID}/users/${context.auth.uid}`).once('value');
  if (!member.exists()) {
    throw new functions.https.HttpsError('permission-denied', 'You are not in this game.');
  }

  const gameRef = db.ref(`games/${gameID}`);
  const game = (await gameRef.once('value')).val() || {};
  const users = game.users || {};
  const secrets = game.secrets || {};

  // Secret names live in /secrets; rooms from before that change kept them on the player.
  const names = Object.keys(users)
    .map(key => secrets[key] || users[key].fake)
    .filter(name => typeof name === 'string' && name.length > 0);
  if (names.length < 2) {
    throw new functions.https.HttpsError('failed-precondition', 'You need at least 2 players to start.');
  }

  // A reveal takes 2.5s per name; if nobody finished it (everyone left mid-reveal),
  // let the room be started again instead of staying stuck.
  const previousNames = Array.isArray(game.names) ? game.names.length : 0;
  const stale = ['shuffling', 'playing'].includes(game.state) &&
    !(Date.now() - (game.startedAt || 0) < previousNames * 2500 + 30000);

  // Claim the start atomically so two players pressing Start at once only start one reveal.
  const claim = await gameRef.child('state').transaction(current => {
    // The first pass can run on an empty local cache; the server then retries with the real value.
    if (current === null) {
      return null;
    }
    if (current === 'waiting' || (stale && current === game.state)) {
      return 'shuffling';
    }
    return undefined;
  });
  if (!claim.committed) {
    return true;
  }

  await gameRef.update({
    names: shuffle(names),
    startedAt: ServerValue.TIMESTAMP,
    state: 'playing'
  });
  return true;
});
