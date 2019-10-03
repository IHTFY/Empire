document.addEventListener('DOMContentLoaded', async () => {
  // // Initialize the FirebaseUI Widget using Firebase.
  // const ui = new firebaseui.auth.AuthUI(firebase.auth());

  // TODO allow real auth sign in, converting from anon to real, and do a check on page load whether already logged in. I think the UI has that last part bulit in.

  // Anonymously login the user
  firebase.auth().signInAnonymously().catch(err => {
    // Handle Errors here.
    const errorCode = err.code;
    const errorMessage = err.message;
    console.error(`Error code ${errorCode}: ${errorMessage}`);
  });

  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      // User is signed in.
      var isAnonymous = user.isAnonymous;
      var uid = user.uid;
      console.log(`User is signed in. ${isAnonymous ? 'Anon' : ''} ${uid}`);
    } else {
      // User is signed out.
      console.log('User is signed out.');
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

    let gameLink = `${window.location.origin}?code=${gameID}`;

    let shareLink = document.createElement('button');
    shareLink.textContent = 'Get Game Link';
    shareLink.className = 'waves-effect waves-light btn blue';
    shareLink.addEventListener('click', () => {
      navigator.clipboard.writeText(gameLink).then(function () {
        M.toast({ html: 'Copied Game Link to Clipboard' });
      }, function (err) {
        M.toast({ html: 'Error Copying Game Link to Clipboard' });
      });
    });

    let shareIcon = document.createElement('i');
    shareIcon.className = "material-icons left";
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
      userGameCode.className = 'invalid';
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
      userGameCode.className = 'invalid';
      userGameCodeHelper.setAttribute('data-error', `${gameCode} doesn't exist. Check the code or create a new game with this code.`);
    } else {
      gameID = gameCode;
      initGame(gameID);
    }
  }

  let urlCode = (new URL(window.location.href)).searchParams.get("code");
  if (urlCode) {
    document.getElementById('userGameCodeLabel').className = 'active';
    userGameCode.value = urlCode;
    tryJoining();
  }

  createButton.addEventListener('click', tryCreating);
  joinButton.addEventListener('click', tryJoining);

  let userID = null;
  let userRef = null;
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
      let userRealName = realName.value;

      function isValidName(n) {
        if (n === '') return false;
        // TODO check if name is unique within the game
        return true;
      }

      if (isValidName(userRealName)) {
        realName.className = 'valid';

        // create user
        async function createUser(user) {
          return (await db.collection('users').add(({ game: gameID, real: user, clan: user }))).id;
        }
        userID = await createUser(userRealName);
        userRef = db.collection('users').doc(userID);
        console.log(`User ID: ${userRealName}`);

        // add the user to their game
        gameRef.update({ "users": firebase.firestore.FieldValue.arrayUnion(userID) });

        // get the user's fake name
        let userFakeName = secretName.value;

        function isValidSecretName(n) {
          if (n === '') return false;
          // TODO do checks on secret name
          return true;
        }

        if (isValidSecretName(userFakeName)) {
          secretName.className = 'valid';

          // update the user profile with their fake name
          userRef.update({ fake: userFakeName });

          document.getElementsByClassName('setup')[0].remove();
          startGame();
        } else {
          secretName.className = 'invalid';
          secretNameHelper.setAttribute('data-error', 'Invalid Secret Name');
        }
      } else {
        realName.className = 'invalid';
        realNameHelper.setAttribute('data-error', 'Invalid Real Name');
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
      let game = snapshot.data(); // TODO data not used yet
      updateUserList();
    });
  }

  async function updateUserList() {
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


  function doEverythingElse() {
    let list = {};
    let fakeNameList = [];

    const submitNames = document.getElementById('submitNames');
    const displayNames = document.getElementById('displayNames');
    const clearNames = document.getElementById('clearNames');
    const generateName = document.getElementById('generateName');
    const updateAnon = document.getElementById('updateAnon');
    const nameList = document.getElementById('nameList');
    const realName = document.getElementById('realName');
    const secretName = document.getElementById('secretName');
    const anonList = document.getElementById('anonList');

    function clearForm() {
      realName.value = '';
      secretName.value = '';
    }

    function updateList() {
      nameList.textContent = JSON.stringify(list, null, 2);
    }

    function addToList() {
      list[realName.value] = sanitizeName(secretName.value);
      clearForm();
      updateList();
    }

    function clearList() {
      list = {};
      updateList();
    }

    function sanitizeName(raw) {
      //TODO different rules for allowed characters etc.
      return raw.toUpperCase().replace(/[^A-Z]/g, '').trim();
    }

    function toggleDisplay(id) {
      let elt = document.getElementById(id);
      elt.style.display = elt.style.display === 'none' ? 'block' : 'none';
    }

    function toggleList() {
      toggleDisplay('nameList');
      displayNames.value = displayNames.value.includes('Show') ? 'Hide List' : 'Show List';
    }

    function shuffle(a) {
      for (let i = 0; i < a.length - 1; i++) {
        let j = i + Math.floor(Math.random() * (a.length - i));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function generateAnon() {
      let mixedSecrets = shuffle(Object.values(list));
      anonList.textContent = JSON.stringify(mixedSecrets, null, 2);
    }

    async function getEnglishWords() {
      const url = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt';
      const response = await fetch(url);
      const text = await response.text();
      return text.split('\n');
    }

    async function generateFake() {
      if (fakeNameList.length === 0) {
        fakeNameList = await getEnglishWords();
      }
      realName.value = 'Fake' + Date.now();
      secretName.value = fakeNameList[Math.floor(Math.random() * fakeNameList.length)];
      addToList();
    }


    // Add listeners to buttons
    submitNames.addEventListener('click', addToList);
    displayNames.addEventListener('click', toggleList);
    clearNames.addEventListener('click', clearList);
    generateName.addEventListener('click', generateFake);
    updateAnon.addEventListener('click', generateAnon);
    nameList.style.display = 'none'; // Start list hidden


    // Submit on enter
    document.onkeydown = function (e) {
      e = e || window.event;
      switch (e.which || e.keyCode) {
        case 13:
          addToList();
          break;
      }
    }
  }
  // doEverythingElse();
});