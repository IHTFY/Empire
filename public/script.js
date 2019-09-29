document.addEventListener('DOMContentLoaded', async () => {
  const db = firebase.firestore();

  // show screen to choose: join game, or create game
  const userGameCode = document.getElementById('userGameCode');
  const createButton = document.getElementById('createButton');
  const joinButton = document.getElementById('joinButton');

  async function doesGameExist(code) {
    if (code === '') return false;
    return (await db.collection('games').doc(code).get()).exists;
  }

  // add the game and save the ID, make sure we check above that the gameCode doesn't exist
  async function createGame(code) {
    let game = {
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
    console.log(`Game ID: ${gameID}`);

    // change view from game code to user creation
    document.getElementsByClassName('create')[0].style.display = 'none';
    setupUser();
  }

  createButton.addEventListener('click', async () => {
    let gameCode = userGameCode.value;
    if (await doesGameExist(gameCode)) {
      console.log(`${gameCode} exists already. Join or choose a new Game Code.`);
    } else {
      gameID = await createGame(gameCode);
      userGameCode.value = gameID;
      initGame(gameID);
    }
  });

  joinButton.addEventListener('click', async () => {
    let gameCode = userGameCode.value;
    if (!await doesGameExist(gameCode)) {
      console.log(`${gameCode} doesn't exist. Check the code or create a new game with this code.`);
    } else {
      gameID = gameCode;
      initGame(gameID);
    }
  });

  let userID = null;
  let userRef = null;
  async function setupUser() {
    document.getElementsByClassName('setup')[0].style.display = 'block';
    const realName = document.getElementById('realName');
    const secretName = document.getElementById('secretName');
    const submitNames = document.getElementById('submitNames');


    submitNames.addEventListener('click', async () => {
      // ask the user for their real name
      let userRealName = realName.value;

      function isValidName(n) {
        if (n === '') return false;
        // TODO check if name is unique within the game
        return true;
      }

      if (isValidName(userRealName)) {
        // create user
        async function createUser(user) {
          return (await db.collection('users').add(({ real: user, clan: user }))).id;
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
          // update the user profile with their fake name
          userRef.update({ fake: userFakeName });

          document.getElementsByClassName('setup')[0].style.display = 'none';
          startGame();
        } else {
          console.log('invalid secret name')
        }
      } else {
        console.log('invalid real name');
      }
    });
  };

  async function startGame() {
    document.getElementsByClassName('play')[0].style.display = 'block';
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