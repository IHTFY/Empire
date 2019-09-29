document.addEventListener('DOMContentLoaded', async event => {
  const db = firebase.firestore();

  // show screen to choose: join game, or create game
  const userGameCode = document.getElementById('userGameCode');
  const createButton = document.getElementById('createButton');
  const joinButton = document.getElementById('joinButton');

  let joinOrNew = null;

  // get the game code
  let gameCode = null;
  const setCodeAndChoice = choice => {
    gameCode = userGameCode.value;
    joinOrNew = choice;
  };

  const doesGameExist = async code => (await db.collection('games').doc(code).get()).exists;

  // returns gameRef
  const getGame = async code => db.collection('games').doc(code);

  // add the game and save the ID, make sure we check above that the gameCode doesn't exist
  const createGame = async (game) => {
    if (gameCode !== '') {
      await db.collection('games').doc(gameCode).set(game);
      return gameCode;
    } else {
      return (await db.collection('games').add(game)).id;
    }
  }

  const initGame = async gameID => {
    document.title = `Empire: ${gameID}`
    let gameRef = db.collection('games').doc(gameID);
    console.log(`Game ID: ${gameID}`);

    // ask the user for their real name
    let userRealName = prompt("Your Real Name", 'realname1');
    // make sure name is unique within the game

    // create user
    const createUser = async (user) => await db.collection('users').doc(user).set({ clan: user });
    await createUser(userRealName);
    let userRef = db.collection('users').doc(userRealName);
    console.log(`User ID: ${userRealName}`);

    // add the user to their game
    gameRef.update({ "users": firebase.firestore.FieldValue.arrayUnion(userRealName) });

    // get the user's fake name
    let userFakeName = prompt("Your Secret Name", 'mysteryname1');
    // update the user profile with their fake name
    userRef.update({ fake: userFakeName });
  }

  let gameID = null;

  createButton.addEventListener('click', async () => {
    setCodeAndChoice('create');
    if (await doesGameExist(gameCode)) {
      console.log(`${gameCode} exists already. Join or choose a new Game Code.`);
    } else {
      gameID = await createGame({
        "state": "initializing",
        // "turn": null,
        "users": {},
        "clans": {}
      });
      initGame(gameID);
    }
  });

  joinButton.addEventListener('click', async () => {
    setCodeAndChoice('new');
    if (!await doesGameExist(gameCode)) {
      console.log(`${gameCode} doesn't exist. Check the code or create a new game with this code.`);
    } else {
      gameID = gameCode;
      initGame(gameID);
    }
  });


  const doEverythingElse = () => {

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

    const clearForm = () => {
      realName.value = '';
      secretName.value = '';
    }

    const updateList = () => {
      nameList.textContent = JSON.stringify(list, null, 2);
    }

    const addToList = () => {
      list[realName.value] = sanitizeName(secretName.value);
      clearForm();
      updateList();
    }

    const clearList = () => {
      list = {};
      updateList();
    }

    const sanitizeName = raw => {
      //TODO different rules for allowed characters etc.
      return raw.toUpperCase().replace(/[^A-Z]/g, '').trim();
    }

    const toggleDisplay = id => {
      let elt = document.getElementById(id);
      elt.style.display = elt.style.display === 'none' ? 'block' : 'none';
    }

    const toggleList = () => {
      toggleDisplay('nameList');
      displayNames.value = displayNames.value.includes('Show') ? 'Hide List' : 'Show List';
    }

    const shuffle = a => {
      for (let i = 0; i < a.length - 1; i++) {
        let j = i + Math.floor(Math.random() * (a.length - i));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const generateAnon = () => {
      let mixedSecrets = shuffle(Object.values(list));
      anonList.textContent = JSON.stringify(mixedSecrets, null, 2);
    }

    const getEnglishWords = async () => {
      const url = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt';
      const response = await fetch(url);
      const text = await response.text();
      return text.split('\n');
    }

    const generateFake = async () => {
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
  doEverythingElse();
});

// let svg = d3.select("body")
//     .append("svg")
//     .attr("width", window.innerWidth)
//     .attr("height", window.innerHeight);


// let svg = d3.select("svg");

// let canvas = svg.append('g');
// let clickSurface = svg.append('g');
// let clickCount = 0;

// clickSurface.append('rect')
//     .attr('width', window.innerWidth)
//     .attr('height', window.innerHeight)
//     .style('opacity', 0)
//     .on('click', function (d) {
//         canvas.append('circle')
//             .attr('r', 50)
//             .attr('fill', `hsl(${clickCount+=10%360},100%,50%)`)
//             .attr('cx', d3.mouse(this)[0])
//             .attr('cy', d3.mouse(this)[1])
//             .transition()
//             .duration(1000)
//             .attr('r', window.innerHeight)
//             .style('opacity', 0)
//             .remove();
//     });
