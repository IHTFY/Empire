let list = {};

document.getElementById('submitNames').addEventListener('click', addToList);
document.getElementById('displayNames').addEventListener('click', toggleList);
document.getElementById('clearNames').addEventListener('click', clearList);
document.getElementById('generateName').addEventListener('click', generateFake);
document.getElementById('updateAnon').addEventListener('click', generateAnon);
// Start list hidden
document.getElementById('nameList').style.display = 'none';

function addToList(sanitize) {
  let realName = document.getElementById('realName').value;
  if (sanitize) {
    realName = sanitize(realName);
  }
  list[realName] = sanitizeName(document.getElementById('secretName').value);
  clearForm();
  updateList();
}

function clearList() {
  list = {};
  updateList();
}

function clearForm() {
  document.getElementById('realName').value = '';
  document.getElementById('secretName').value = '';
}

function updateList() {
  document.getElementById('nameList').textContent = JSON.stringify(list, null, 2);
}

function sanitizeName(raw) {
  //TODO different rules for allowed characters etc.
  return raw.toUpperCase().replace(/[^A-Z]/g, '').trim();
}

function toggleList() {
  toggleDisplay('nameList');
  document.getElementById('displayNames').value = document.getElementById('displayNames').value.includes('Show') ? 'Hide List' : 'Show List';
}

function toggleDisplay(id) {
  let elt = document.getElementById(id);
  elt.style.display = elt.style.display === 'none' ? 'block' : 'none';
}

function shuffle(a) {
  for (let i = 0; i < a.length - 1; i++) {
    let j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateAnon() {
  let anonList = shuffle(Object.values(list));
  document.getElementById('anonList').textContent = JSON.stringify(anonList, null, 2);
}

async function generateName() {
  const url = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt';
  const response = await fetch(url);
  const text = await response.text();
  return text.split('\n')[Math.floor(Math.random() * 10000)];
}

async function generateFake() {
  document.getElementById('realName').value = 'Fake' + Date.now();
  document.getElementById('secretName').value = await generateName();
  addToList(false);
}

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
