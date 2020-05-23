document.addEventListener('DOMContentLoaded', async () => {
  // NOTE ON for development. OFF for deployment.
  // firebase.functions().useFunctionsEmulator('http://localhost:5001');

  let uid = null;
  let fresh = true;

  // Handle login
  firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      // Sign in anonymously
      firebase.auth().signInAnonymously().catch(err => {
        console.error(`Error code ${err.code}: ${err.message}`);
      });
    } else {
      // User is signed in.
      uid = user.uid;

      if (localStorage.getItem('realName')) {
        document.getElementById('realName').value = localStorage.getItem('realName');
        document.getElementById('realNameLabel').classList.add('active');
      }
    }
  });

  // Start the database instance
  const db = firebase.database();


  M.AutoInit();
  // const navbar = M.Sidenav.init(document.querySelectorAll('.sidenav'));
  // const modals = M.Modal.init(document.querySelectorAll('.modal'));
  // const dropdowns = M.Dropdown.init(document.querySelectorAll('.dropdown-trigger'));
  // const fab = M.FloatingActionButton.init(document.querySelectorAll('.fixed-action-btn'));

  const volumeIcon = document.getElementById('volumeIcon');
  if (!localStorage.getItem('mute')) {
    localStorage.mute = 'volume_off';
  }
  volumeIcon.textContent = localStorage.getItem('mute');

  volumeIcon.addEventListener('click', () => {
    localStorage.setItem('mute', localStorage.getItem('mute') === 'volume_off' ? 'volume_up' : 'volume_off');
    volumeIcon.textContent = localStorage.getItem('mute');
  });



  // show screen to choose: join game, or create game
  const userGameCode = document.getElementById('userGameCode');
  const userGameCodeHelper = document.getElementById('userGameCodeHelper');
  const createButton = document.getElementById('createButton');
  const joinButton = document.getElementById('joinButton');

  // doesn't run if I do back/forward in browser
  if (userGameCode.value) {
    document.getElementById('userGameCodeLabel').classList.add('active');
  }

  async function doesGameExist(code) {
    if (code === '') return false;
    let snapshot = await db.ref(`games/${code}`).once('value');
    return snapshot.exists();
  }

  // add the game and save the ID, make sure we check above that the gameCode doesn't exist
  async function createGame(code) {
    const game = {
      "state": "waiting",
      // "turn": null,
      "users": {},
      "clans": {}
    }
    if (code === '') {
      let newGameCode = db.ref('games').push().key;
      db.ref(`games/${newGameCode}`).set(game);
      return newGameCode;
    } else {
      await db.ref(`games/${code}`).set(game);
      return code;
    }
  }

  let gameID = null;

  async function initGame(gameID) {
    document.title = `Empire: ${gameID}`

    let url = new URL(document.location);
    url.searchParams.set('code', gameID);
    let gameLink = url.href;

    let shareLink = document.createElement('button');
    shareLink.textContent = 'Get Game Link';
    shareLink.classList.add('waves-effect', 'waves-light', 'btn-flat', 'btn-large');
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

    // console.log(`Game ID: ${gameID}`);

    // change view from game code to user creation
    document.getElementsByClassName('create')[0].classList.add('hide');
    setupUser();
  }

  async function tryCreating() {
    let gameCode = userGameCode.value;
    if (await doesGameExist(gameCode)) {
      userGameCode.classList.replace('valid', 'invalid');
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
      userGameCode.classList.replace('valid', 'invalid');
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

      // get the user's real name
      const userRealName = realName.value;

      function isValidName(n) {
        if (n === '') return false;
        // TODO check if name is unique within the game
        return true;
      }

      if (isValidName(userRealName)) {
        localStorage.setItem('realName', userRealName);
        realName.classList.add('valid');

        // (create game and) add user
        db.ref(`games/${gameID}/users/${uid}`).set(
          {
            //game: gameID,
            real: userRealName,
            clan: userRealName
          }
        );

      } else {
        realName.classList.add('invalid');
        realNameHelper.setAttribute('data-error', 'Invalid Real Name');
      }

      function sanitizeName(raw) {
        //TODO different rules for allowed characters etc.
        return raw.toLowerCase().replace(/[^ A-Za-z0-9]/g, '').replace(/\s+/g, ' ').trim();
      }

      // get the user's fake name
      let userFakeName = sanitizeName(secretName.value);

      function isValidSecretName(n) {
        if (n === '') return false;
        // TODO do checks on secret name
        return true;
      }

      if (isValidSecretName(userFakeName)) {
        secretName.classList.add('valid');

        if (isValidName(userRealName)) {
          // update the user profile with their fake name
          db.ref(`games/${gameID}/users/${uid}`).update({ fake: userFakeName });

          document.getElementsByClassName('setup')[0].classList.add('hide');
          lobby();
        }
      } else {
        secretName.classList.add('invalid');
        secretNameHelper.setAttribute('data-error', 'Invalid Secret Name');
      }

    });
  };

  async function lobby() {
    db.ref(`games/${gameID}`).update({ state: 'waiting' });

    let fakeSecretList = [];
    let fakeNameList = [];
    let fakes = 0;

    async function populateList(url) {
      const response = await fetch(url);
      const text = await response.text();
      return text.split('\n');
    }

    function pickRandom(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    async function generateFake() {
      if (fakes === 0) {
        fakeNameList = await populateList('names.txt');
        fakeSecretList = await populateList('words.txt');
        // fakeNameList = await populateList('https://raw.githubusercontent.com/dominictarr/random-name/master/first-names.txt');
        // fakeSecretList = await populateList('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt');
      }
      let fakeName = pickRandom(fakeNameList).trim();
      let fakeSecret = pickRandom(fakeSecretList).trim();

      // add the fake user to users
      let fakeID = db.ref(`games/${gameID}/users`).push().key;

      // add the fake user to their game
      db.ref(`games/${gameID}/users/${fakeID}`).set(
        {
          game: gameID,
          real: fakeName,
          clan: fakeName,
          fake: fakeSecret,
          fakeBadge: true
        });

      fakes++;
    }

    document.getElementsByClassName('play')[0].classList.remove('hide');

    // don't want to double up listeners. Maybe use .once and destruct somehow? .removeEventListener
    if (fresh) {
      fresh = false;

      const generateName = document.getElementById('generateName');
      generateName.addEventListener('click', generateFake);

      // update user list whenever data changes in /users
      // should probably have separate realname list to watch; I'm grabbing full user obj list here.
      db.ref(`games/${gameID}/users`).on('value', snapshot => {
        if (snapshot.val()) {
          updateUserList(snapshot.val());

          if (localStorage.getItem('mute') === 'volume_up') {
            document.getElementById('boop').load();
            document.getElementById('boop').play();
          }
        }
      });


      const resetButton = document.getElementById('roomResetButton');
      resetButton.addEventListener('click', () => {
        db.ref(`games/${gameID}`).update({ state: 'resetting' });
      });

      const deleteButton = document.getElementById('roomDeleteButton');
      deleteButton.addEventListener('click', () => {
        db.ref(`games/${gameID}`).update({ state: 'deleting' });
      });

      const startButton = document.getElementById('revealSecrets');
      const flashNames = firebase.functions().httpsCallable('flashNames');

      startButton.addEventListener('click', async () => {
        const playIcon = document.getElementById('playIcon');
        const revealSpinner = document.getElementById('revealSpinner');
        const revealSecrets = document.getElementById('revealSecrets');

        playIcon.classList.add('hide');
        revealSpinner.classList.remove('hide');
        revealSecrets.classList.add('disabled');

        await flashNames({ text: gameID });

        playIcon.classList.remove('hide');
        revealSpinner.classList.add('hide');
        revealSecrets.classList.remove('disabled');
      });

      db.ref(`games/${gameID}/state`).on('value', snapshot => {
        if (snapshot.val() === 'playing') {
          displaySecrets();
        }
        if (snapshot.val() === 'deleting') {
          db.ref(`games/${gameID}`).remove();
          window.location.replace('/');
        }
        if (snapshot.val() === 'resetting') {
          db.ref(`games/${gameID}/users/${uid}`).remove();
          document.getElementsByClassName('reveal')[0].classList.add('hide');
          document.getElementsByClassName('play')[0].classList.add('hide');
          secretName.value = '';
          document.getElementsByClassName('setup')[0].classList.remove('hide');
          db.ref(`games/${gameID}/users`).remove();
        }
      });
    }
  }

  async function updateUserList(usersObject) {

    const nameList = document.getElementById('nameList');
    nameList.innerHTML = `<li class="collection-header center-align"><h5>${gameID} Lobby</h5></li>`;
    // console.log(usersObject);
    for (let user of Object.values(usersObject)) {
      // console.log(user);
      let item = document.createElement('li');
      item.classList.add('collection-item');
      let txt = document.createElement('h6');
      txt.textContent = user.real
      if (user.fakeBadge) {
        const b = document.createElement('span');
        b.classList.add('new', 'badge', 'indigo', 'darken-3');
        b.setAttribute('data-badge-caption', 'FAKE');
        txt.appendChild(b);
      }
      item.appendChild(txt);
      nameList.appendChild(item);
    }
  }

  function displaySecrets() {
    // console.log('displaying');
    document.getElementsByClassName('play')[0].classList.add('hide');
    document.getElementsByClassName('reveal')[0].classList.remove('hide');
    const panel = document.getElementById('revealPanel');


    db.ref(`games/${gameID}/names`).once('value', snapshot => {
      show(snapshot.val());
    });

    function show(fakes) {
      const bar = document.getElementById('progressBar');
      bar.style.setProperty('width', `0%`);

      // const voice = speechSynthesis.getVoices().filter(i => i.lang.includes('en-GB') && i.name.includes('emale'))[0];
      let utterance = new SpeechSynthesisUtterance();
      // utterance.voice = voice;

      fakes.forEach((name, i) => setTimeout(() => {
        if (localStorage.getItem('mute') === 'volume_up') {
          utterance.text = name;
          speechSynthesis.speak(utterance);
        }
        panel.textContent = name;
        bar.style.setProperty('width', `${100 * (i + 1) / fakes.length}%`);
      }, i * 2500))

      setTimeout(() => {
        panel.textContent = '';
        db.ref(`games/${gameID}`).update({ state: 'waiting' });
        document.getElementsByClassName('play')[0].classList.remove('hide');
        document.getElementsByClassName('reveal')[0].classList.add('hide');
      }, fakes.length * 2500);
    }
  }

});