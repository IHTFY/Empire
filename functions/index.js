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

exports.flashNames = functions.https.onCall(async (data, context) => {
  function shuffle(a) {
    for (let i = 0; i < a.length - 1; i++) {
      let j = i + Math.floor(Math.random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // get fakes, shuffle, store in names
  await db.ref(`games/${data.text}/users`).once('value').then(async snapshot => {
    let fakes = Object.values(snapshot.val()).map(user => user.fake);
    await db.ref(`games/${data.text}/names`).set(shuffle(fakes));
    await db.ref(`games/${data.text}/state`).set('playing');
    setTimeout(async () => {
      await db.ref(`games/${data.text}/state`).set('initializing')
    }, 1500);
    return true;
  });
});

exports

// exports.getGameUsers = functions.https.onCall((data, context) => {
//   return db.collection('users').where('game', '==', data).get();
// });