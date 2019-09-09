let list = {};

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

const generateWord = async () => {
  const url = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt';
  const response = await fetch(url);
  const text = await response.text();
  return text.split('\n')[Math.floor(Math.random() * 10000)];
}

const generateFake = async () => {
  realName.value = 'Fake' + Date.now();
  secretName.value = await generateWord();
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
