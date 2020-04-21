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

const db = admin.firestore();


exports.getGameUsers = functions.https.onCall((data, context) => {
  return db.collection('users').where('game', '==', data).get();
});