// Firebase discovers deployed functions from these exports. Keep their names and trigger
// paths stable; implementation belongs to the feature modules below.
const { functions, instance } = require('./firebase');
const { flashNames, revealRemoved } = require('./reveal');
const { prepareVoice } = require('./voice');
const { roomState, dailySweep } = require('./room-lifecycle');

const secrets = functions.database.instance(instance).ref('/games/{gameId}/secrets/{userId}');
exports.flashNames = functions.https.onCall(flashNames);
exports.prepareVoice = secrets.onWrite(prepareVoice);
exports.revealRemoved = secrets.onDelete(revealRemoved);
exports.roomState = functions.database.instance(instance).ref('/games/{gameId}/state').onWrite(roomState);
exports.dailySweep = functions.pubsub.schedule('every 24 hours').onRun(dailySweep);
