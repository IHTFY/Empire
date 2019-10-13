document.addEventListener('DOMContentLoaded', async () => {
  const functions = firebase.functions();

  let uid = null;
  let userRef = null;

  // Handle login
  firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      if (false) {
        // TODO ask to sign in
        // // Initialize the FirebaseUI Widget using Firebase.
        // const ui = new firebaseui.auth.AuthUI(firebase.auth());
        // else, Anonymously login the user
      } else {
        // Sign in anonymously
        firebase.auth().signInAnonymously().catch(err => {
          console.error(`Error code ${err.code}: ${err.message}`);
        });
      }
    } else {
      // User is signed in.
      let isAnonymous = user.isAnonymous;
      uid = user.uid;
      userRef = db.collection('users').doc(uid);

      if (isAnonymous) {
        console.log('User is anonymous.');
        // TODO prompt to connect account
      }
      console.log('User ID: ' + uid);
      if (user.displayName) {
        document.getElementById('realName').value = user.displayName;
        document.getElementById('realName').classList.add('disabled');
      }
      // TODO create signout button
    }
  });

  // Start the database instance
  const db = firebase.firestore();

  // trigger sidenav on mobile
  M.Sidenav.init(document.querySelectorAll('.sidenav'));
  // can try autoinit too, if no options are used
  // M.AutoInit();

  // show screen to choose: join game, or create game
  const userGameCode = document.getElementById('userGameCode');
  const userGameCodeHelper = document.getElementById('userGameCodeHelper');
  const createButton = document.getElementById('createButton');
  const joinButton = document.getElementById('joinButton');

  async function doesGameExist(code) {
    if (code === '') return false;
    return (await db.collection('games').doc(code).get()).exists;
  }

  // add the game and save the ID, make sure we check above that the gameCode doesn't exist
  async function createGame(code) {
    const game = {
      "state": "initializing",
      // "turn": null,
      "users": {},
      "clans": {}
    }
    if (code === '') {
      return (await db.collection('games').add(game)).id;
    } else {
      await db.collection('games').doc(code).set(game);
      return code;
    }
  }

  let gameID = null;
  let gameRef = null;

  async function initGame(gameID) {
    document.title = `Empire: ${gameID}`
    gameRef = db.collection('games').doc(gameID);

    let url = new URL(document.location);
    url.searchParams.set('code', gameID);
    let gameLink = url.href;

    let shareLink = document.createElement('button');
    shareLink.textContent = 'Get Game Link';
    shareLink.classList.add('waves-effect', 'waves-light', 'btn', 'blue');
    shareLink.addEventListener('click', () => {
      navigator.clipboard.writeText(gameLink).then(function () {
        M.toast({ html: 'Copied Game Link to Clipboard' });
      }, function (err) {
        M.toast({ html: 'Error Copying Game Link to Clipboard' });
      });
    });

    let shareIcon = document.createElement('i');
    shareIcon.classList.add('material-icons', 'left');
    shareIcon.textContent = 'person_add';
    shareLink.appendChild(shareIcon)

    document.getElementById('gameLink').appendChild(shareLink);

    console.log(`Game ID: ${gameID}`);

    // change view from game code to user creation
    document.getElementsByClassName('create')[0].remove();
    setupUser();
  }

  async function tryCreating() {
    let gameCode = userGameCode.value;
    if (await doesGameExist(gameCode)) {
      userGameCode.classList.remove('valid');
      userGameCode.classList.add('invalid');
      userGameCodeHelper.setAttribute('data-error', `${gameCode} already exists. Join or choose a new Game Code.`);
    } else {
      gameID = await createGame(gameCode);
      userGameCode.value = gameID;
      initGame(gameID);
    }
  }

  async function tryJoining() {
    let gameCode = userGameCode.value;
    if (!await doesGameExist(gameCode)) {
      userGameCode.classList.remove('valid');
      userGameCode.classList.add('invalid');
      userGameCodeHelper.setAttribute('data-error', `${gameCode} doesn't exist. Check the code or create a new game with this code.`);
    } else {
      gameID = gameCode;
      initGame(gameID);
    }
  }

  let urlCode = (new URL(document.location)).searchParams.get('code');
  if (urlCode) {
    document.getElementById('userGameCodeLabel').classList.add('active');
    userGameCode.value = urlCode;
    tryJoining();
  }

  createButton.addEventListener('click', tryCreating);
  joinButton.addEventListener('click', tryJoining);

  async function setupUser() {
    document.getElementsByClassName('setup')[0].classList.remove('hide');
    const realName = document.getElementById('realName');
    const realNameHelper = document.getElementById('realNameHelper');
    const secretName = document.getElementById('secretName');
    const secretNameHelper = document.getElementById('secretNameHelper');
    const submitNames = document.getElementById('submitNames');

    submitNames.addEventListener('click', async () => {
      realName.className = 'validate';
      secretName.className = 'validate';

      // ask the user for their real name
      const userRealName = realName.value;

      function isValidName(n) {
        if (n === '') return false;
        // TODO check if name is unique within the game
        return true;
      }

      if (isValidName(userRealName)) {
        realName.classList.add('valid');

        // create user
        userRef.set({ game: gameID, real: userRealName, clan: userRealName });

        // add the user to their game
        gameRef.update({ "users": firebase.firestore.FieldValue.arrayUnion(uid) });

      } else {
        realName.classList.add('invalid');
        realNameHelper.setAttribute('data-error', 'Invalid Real Name');
      }

      // get the user's fake name
      let userFakeName = secretName.value;

      function isValidSecretName(n) {
        if (n === '') return false;
        // TODO do checks on secret name
        return true;
      }

      if (isValidSecretName(userFakeName)) {
        secretName.classList.add('valid');

        if (isValidName(userRealName)) {
          // update the user profile with their fake name
          userRef.update({ fake: userFakeName });

          document.getElementsByClassName('setup')[0].remove();
          startGame();
        }
      } else {
        secretName.classList.add('invalid');
        secretNameHelper.setAttribute('data-error', 'Invalid Secret Name');
      }

    });
  };

  async function startGame() {
    let fakeNameList = [];
    let fakes = 0;

    async function getEnglishWords() {
      const url = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt';
      const response = await fetch(url);
      const text = await response.text();
      return text.split('\n');
    }

    async function generateFake() {
      if (fakes === 0) {
        fakeNameList = await getEnglishWords();
      }
      let fakeName = `Fake${fakes}`;
      let fakeSecret = fakeNameList[Math.floor(Math.random() * fakeNameList.length)];

      // add the fake user to users
      let fakeID = (await db.collection('users').add(({ game: gameID, real: fakeName, clan: fakeName, fake: fakeSecret }))).id;

      // add the fake user to their game
      gameRef.update({ "users": firebase.firestore.FieldValue.arrayUnion(fakeID) });

      fakes++;
    }

    const generateName = document.getElementById('generateName');
    generateName.addEventListener('click', generateFake);
    document.getElementsByClassName('play')[0].classList.remove('hide');
    // TODO this is when anyting in the game doc changes
    gameRef.onSnapshot(async snapshot => {
      // let game = snapshot.data(); // TODO data not used yet
      updateUserList();
    });
  }

  async function updateUserList() {
    // let currentUsers = await functions.httpsCallable('getGameUsers')(gameID);
    let currentUsers = (await db.collection('users').where('game', '==', gameID).get());
    const nameList = document.getElementById('nameList');
    nameList.innerHTML = '';
    currentUsers.forEach(snap => {
      let row = document.createElement('tr');
      let cell = document.createElement('td');
      cell.textContent = snap.data()['real'];
      row.appendChild(cell);
      nameList.appendChild(row);
    });
  }



  // Old functions, might use later
  //
  function shuffle(a) {
    for (let i = 0; i < a.length - 1; i++) {
      let j = i + Math.floor(Math.random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sanitizeName(raw) {
    //TODO different rules for allowed characters etc.
    return raw.toUpperCase().replace(/[^A-Z]/g, '').trim();
  }
  //

});