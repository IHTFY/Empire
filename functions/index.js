// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
const serviceAccount = require('./ADMINCRED.json');

//https://stackoverflow.com/questions/58127896/error-could-not-load-the-default-credentials-firebase-function-to-firestore
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://empire-ihtfy.firebaseio.com'
});

// const db = admin.firestore();
const db = admin.database();

// gcloud alpha functions add-iam-policy-binding flashNames --member=allUsers --role=roles/cloudfunctions.invoker
// https://github.com/firebase/functions-samples/issues/395#issuecomment-605025572
exports.flashNames = functions.https.onCall(async (data, context) => {
  function shuffle(a) {
    for (let i = 0; i < a.length - 1; i++) {
      let j = i + Math.floor(Math.random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // get fakes, shuffle, store in names
  let gameRef = db.ref(`games/${data.text}`);
  await gameRef.child('users').once('value').then(async snapshot => {
    let fakes = Object.values(snapshot.val()).map(user => user.fake);
    await gameRef.child('names').set(shuffle(fakes));
    await gameRef.child('state').set('playing');
    setTimeout(async () => {
      await gameRef.child('state').set('waiting')
    }, 1500);
    return true;
  });
});