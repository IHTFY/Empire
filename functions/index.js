const functions = require('firebase-functions');

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest((request, response) => {
 response.send("Hello from Firebase!");
});

// TODO use more cloud functions for security/syncing
// Also check about speed, cloud probably much slower
// Also, do I need to import/require/init something in this file to link it to public?
// const admin = require('firebase-admin'); and admin.initializeApp();, to give cloud functions admin ability?
