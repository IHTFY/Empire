// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions/v1');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');

// Uses the Cloud Functions runtime's default service account credentials. A named app keeps
// this connection separate from the one the functions framework opens for database triggers.
const emulated = process.env.FUNCTIONS_EMULATOR === 'true';
const instance = emulated ? `${process.env.GCLOUD_PROJECT}-default-rtdb` : 'empire-ihtfy';
const app = initializeApp({
  databaseURL: `https://${instance}.firebaseio.com`
}, 'empire');

const db = getDatabase(app);

module.exports = { functions, db, instance, emulated, ServerValue, applicationDefault };
