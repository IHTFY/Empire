import { CREATURES } from './crest-creatures.js';
import { MYTHICALS } from './crest-mythicals.js';
import { BEASTS } from './crest-beasts.js';

// Crests: each player's avatar is a small coat of arms built from six choices.
// A crest is stored as "shape.color.pattern.emblem.metal.trim". The last component
// is optional in older saves. Unknown parts fall back to defaults, so older
// or newer clients never break each other.

// Every shape sits inside a 48 × 48 box, inset so the "you" ring fits around it.
// cx/cy/s place the emblem (drawn on a 24 × 24 grid) inside the shape.
export const SHAPES = {
  round: { retired: true, label: 'Round', d: 'M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z', cx: 24, cy: 24, s: 1.1 },
  heater: { label: 'Shield', d: 'M7 5h34v16c0 12-8 19-17 23C15 40 7 33 7 21z', cx: 24, cy: 21, s: 1.02 },
  scutum: { label: 'Scutum', d: 'M12.5 4h23c3.6 6 3.6 34 0 40h-23c-3.6-6-3.6-34 0-40z', cx: 24, cy: 24, s: 1 },
  lozenge: { retired: true, label: 'Lozenge', d: 'M24 3l20 21-20 21L4 24z', cx: 24, cy: 24, s: 0.84 },
  banner: { label: 'Banner', d: 'M8 4h32v40l-16-8-16 8z', cx: 24, cy: 19.5, s: 1.02 },
  pennon: { label: 'Pennon', d: 'M4 9h40l-8 15 8 15H4z', cx: 19.5, cy: 24, s: 0.94 },
  oval: { label: 'Oval', d: 'M24 3a16 21 0 1 1 0 42a16 21 0 1 1 0-42z', cx:24, cy:24, s:1 },
  hoplon: { label: 'Hoplon', d: 'M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z', cx: 24, cy: 24, s: .88, rims: [.86, .76] },
  peltast: { label: 'Pelta', d:'M5 6Q24 19 43 6V23Q41 38 24 44Q7 38 5 23z', cx:24, cy:27, s:.92 },
  kite: { label: 'Kite', d:'M24 3Q43 3 42 17Q39 33 24 45Q9 33 6 17Q5 3 24 3z', cx:24, cy:20, s:1 },
  hexagon: { retired: true, label: 'Hexagon', d:'M14 4h20l11 20-11 20H14L3 24z', cx:24, cy:24, s:1.04 },
  standard: { label: 'Standard', d:'M9 4h30v32L24 45 9 36z', cx:24, cy:22, s:1 },
  tablet: { label: 'Tablet', d: 'M10 4h28q4 0 4 4v32q0 4-4 4H10q-4 0-4-4V8q0-4 4-4z', cx: 24, cy: 24, s: 1.1 },
  boeotian: { label: 'Boeotian', d: 'M24 3Q39 3 42 15Q31 24 42 33Q39 45 24 45Q9 45 6 33Q17 24 6 15Q9 3 24 3z', cx: 24, cy: 24, s: .84 },
  octagon: { retired: true, label: 'Octagon', d: 'M15 4h18l11 11v18L33 44H15L4 33V15z', cx: 24, cy: 24, s: 1.08 },
  vexillum: { label: 'Vexillum', d: 'M7 5h34v38l-10-5-7 7-7-7-10 5z', cx: 24, cy: 21, s: 1.02 },
  accolade: { label: 'Accolade', d: 'M24 3Q18 9 7 6Q10 13 5 18C5 32 15 39 24 45C33 39 43 32 43 18Q38 13 41 6Q30 9 24 3z', cx: 24, cy: 23, s: .91, rims: [.86] },
  ogee: { label: 'Ogee', d: 'M6 5Q15 9 24 3Q33 9 42 5C39 13 44 18 40 28C36 38 28 39 24 45C20 39 12 38 8 28C4 18 9 13 6 5z', cx: 24, cy: 23, s: .91, rims: [.84] },
  scallop: { label: 'Scalloped', d: 'M24 3C28 9 34 4 39 6C37 12 45 12 42 18C48 25 40 28 40 32Q33 39 24 45Q15 39 8 32C8 28 0 25 6 18C3 12 11 12 9 6C14 4 20 9 24 3z', cx: 24, cy: 23, s: .9, rims: [.82] },
  targe: { retired: true, label: 'Targe', d: 'M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z', cx: 24, cy: 24, s: .85, rims: [.74], studs: [[24, 7], [36, 12], [41, 24], [36, 36], [24, 41], [12, 36], [7, 24], [12, 12]] },
  vesica: { label: 'Vesica', d: 'M24 3C44 13 44 34 24 45C4 34 4 13 24 3z', cx: 24, cy: 24, s: .82, rims: [.85] },
  crescent: { label: 'Amazon', d: 'M5 5Q24 22 43 5C47 21 40 39 24 45C8 39 1 21 5 5z', cx: 24, cy: 29, s: .76, rims: [.87] },
  cartouche: { label: 'Cartouche', d: 'M24 3C29 9 33 4 39 7C33 14 44 15 40 22C46 28 36 30 37 36Q28 39 24 45Q20 39 11 36C12 30 2 28 8 22C4 15 15 14 9 7C15 4 19 9 24 3z', cx: 24, cy: 24, s: .79, rims: [.85] },
  pavise: { label: 'Pavise', d: 'M6 43V13Q6 4 15 5Q24 1 33 5Q42 4 42 13V43Q33 40 24 45Q15 40 6 43z', cx: 24, cy: 24, s: .95, rims: [.86], studs: [[10, 12], [38, 12], [10, 38], [38, 38]] }
};

export const COLORS = {
  crimson: { label: 'Crimson', hex: '#B8283B' },
  rust: { label: 'Rust', hex: '#C0662B' },
  ochre: { label: 'Ochre', hex: '#8F7A14' },
  green: { label: 'Green', hex: '#2F7D3A' },
  teal: { label: 'Teal', hex: '#0E8A74' },
  azure: { label: 'Azure', hex: '#2E7FB8' },
  blue: { label: 'Blue', hex: '#3F54CF' },
  violet: { label: 'Violet', hex: '#6D4FC2' },
  tyrian: { label: 'Tyrian', hex: '#8E2A62' },
  sable: { label: 'Sable', hex: '#23243A' },
  oxblood:{label:'Oxblood',hex:'#6F2030'}, terracotta:{label:'Terracotta',hex:'#AA503D'}, bronze:{label:'Bronze',hex:'#9A723D'}, sand:{label:'Sand',hex:'#B29C72'}, olive:{label:'Olive',hex:'#68723E'}, pine:{label:'Pine',hex:'#245B4C'}, sea:{label:'Sea',hex:'#327E89'}, midnight:{label:'Midnight',hex:'#243B70'}, plum:{label:'Plum',hex:'#653C78'}, slate:{label:'Slate',hex:'#606C85'},
  porphyry: { label: 'Porphyry', hex: '#754A52' },
  wine: { label: 'Wine', hex: '#842F45' },
  ivory: { label: 'Ivory', hex: '#BDB6A3' },
  verdigris: { label: 'Verdigris', hex: '#468071' },
  iron: { label: 'Iron', hex: '#424956' },
  lapis: { label: 'Lapis', hex: '#314D98' }
};

export const METALS = {
  gold: { label: 'Gold', hex: '#F2B84B' },
  silver: { label: 'Silver', hex: '#E4E6EF' },
  bronze: { label: 'Bronze', hex: '#CD9B57' },
  copper: { label: 'Copper', hex: '#EFAD8D' },
  platinum: { label: 'Platinum', hex: '#BCC9D8' },
  obsidian: { label: 'Obsidian', hex: '#171A2C' }
};

export const TRIMS = {
  basic: { label: 'Basic' },
  inset: { label: 'Inset' },
  double: { label: 'Double' },
  riveted: { label: 'Riveted' }
};

// Divisions of the field, drawn as a shade of the field color.
export const PATTERNS = {
  plain: { label: 'Plain', d: '' },
  pale: { label: 'Per pale', d: 'M24 0h24v48H24z' },
  bend: { label: 'Per bend', d: 'M0 0h48v48z' },
  chief: { label: 'Chief', d: 'M0 0h48v15H0z' },
  chevron: { label: 'Chevron', d: 'M0 48L24 22l24 26z' },
  quarterly: { label: 'Quarterly', d: 'M0 0h24v24H0zM24 24h24v24H24z' },
  cross: { label: 'Cross', d: 'M20 0h8v48h-8zM0 20h48v8H0z' },
  saltire: { label: 'Saltire', d: 'M0 5.7L5.7 0 48 42.3 42.3 48zM42.3 0L48 5.7 5.7 48 0 42.3z' },
  meander: { label: 'Greek key', d: 'M0 17h15v14H3V21h8v6H7v-2h2v-2H5v6h8V19H0zM16 17h15v14H19V21h8v6h-4v-2h2v-2h-4v6h8V19H16zM32 17h15v14H35V21h8v6h-4v-2h2v-2h-4v6h8V19H32z' },
  fluted: { label: 'Fluted', d: 'M6 0h4v48H6zM16 0h4v48h-4zM28 0h4v48h-4zM38 0h4v48h-4z' },
  striped: { label: 'Striped', d: 'M0 6h48v6H0zM0 21h48v6H0zM0 36h48v6H0z' },
  chequer: { label: 'Chequered', d: 'M0 0h12v12H0zM24 0h12v12H24zM12 12h12v12H12zM36 12h12v12H36zM0 24h12v12H0zM24 24h12v12H24zM12 36h12v12H12zM36 36h12v12H36z' },
  gyronny: { label: 'Radiant', d: 'M24 24 0 0h24zM24 24 48 0v24zM24 24 48 48H24zM24 24 0 48V24z' },
  lozengy: { label: 'Diamonds', d: 'M12 0 24 12 12 24 0 12zM36 0 48 12 36 24 24 12zM12 24 24 36 12 48 0 36zM36 24 48 36 36 48 24 36z' },
  fess: { label: 'Fess', d: 'M0 17h48v14H0z' },
  base: { label: 'Base', d: 'M0 32h48v16H0z' }
};

const round = n => Math.round(n * 100) / 100;

function starPath() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.4 : 10.5;
    const a = (-90 + i * 36) * Math.PI / 180;
    pts.push(`${round(12 + r * Math.cos(a))} ${round(12.6 + r * Math.sin(a))}`);
  }
  return `<path d="M${pts.join('L')}z"/>`;
}

// Two laurel branches meeting at the bottom, open at the top.
function laurel() {
  let out = '<path d="M12 21C6.5 20 3.8 15 4.8 6.5M12 21C17.5 20 20.2 15 19.2 6.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>';
  for (let i = 0; i < 5; i++) {
    const deg = 128 + i * 29; // up the left side, from the bottom
    const a = (deg * Math.PI) / 180;
    const x = round(12 + 8 * Math.cos(a));
    const y = round(12.4 + 8 * Math.sin(a));
    const tilt = round(deg - 180 - 38);
    out += `<ellipse cx="${x}" cy="${y}" rx="1.35" ry="3.2" transform="rotate(${tilt} ${x} ${y})"/>`;
    out += `<ellipse cx="${round(24 - x)}" cy="${y}" rx="1.35" ry="3.2" transform="rotate(${-tilt} ${round(24 - x)} ${y})"/>`;
  }
  return out;
}

const lineArt = art => `<g fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${art}</g>`;

export const EMBLEMS = {
  ...MYTHICALS,
  letter: { label: 'Letter' },
  laurel: { label: 'Laurel', svg: laurel() },
  crown: { label: 'Crown', svg: '<path d="M3.5 17.5 2.5 7l5 4L12 4l4.5 7 5-4-1 10.5z"/><rect x="3.5" y="19" width="17" height="2.6" rx="1"/>' },
  star: { retired: true, label: 'Star', svg: starPath() },
  sword: { label: 'Sword', svg: '<path d="M12 1.5l1.4 2.4V15h-2.8V3.9z"/><rect x="6" y="15" width="12" height="2.2" rx="1.1"/><rect x="11" y="17" width="2" height="3.6"/><circle cx="12" cy="21.6" r="1.6"/>' },
  tower: { retired: true, label: 'Tower', svg: '<path fill-rule="evenodd" d="M5 22V8h3V5h2.5v3h3V5H16v3h3v14zM10 22v-4.5a2 2 0 0 1 4 0V22z"/>' },
  helm: { label: 'Helm', svg: CREATURES.helm },
  moon: { retired: true, label: 'Moon', svg: '<path d="M16.1 4A9 9 0 1 0 16.1 20A8 8 0 1 1 16.1 4z"/>' },
  cross: { label: 'Cross', svg: '<path d="M9 2h6l-1.5 8.5L22 9v6l-8.5-1.5L15 22H9l1.5-8.5L2 15V9l8.5 1.5z"/>' },
  eagle:{label:'Eagle',svg:'<path d="M10 8V5q0-3 3-3h2l2 3h-4v3l2 2 7-6v5l-5 4 5-2v3l-6 2 5 1-2 3-5-3 2 5h-8l2-5-5 3-2-3 5-1-6-2v-3l5 2-5-4V4l7 6z"/>'},
  spartan: { label: 'Spartan', svg: CREATURES.spartan },
  spears: { label: 'Spears', svg: lineArt('<path d="M5 21 17 7M19 21 7 7M16 8Q14 4 21 2Q20 9 16 8zM8 8Q10 4 3 2Q4 9 8 8zM6 18l2 1.5M16 19.5l2-1.5"/>') },
  axe:{label:'Axe',svg:'<path d="M11 2h2v21h-2zM13 4q6 0 9-3v10q-4-4-9-4zM11 4Q5 4 2 1v10q4-4 9-4z"/>'},
  wolf: { label: 'Wolf', svg: BEASTS.wolf },
  lion: { label: 'Lion', svg: CREATURES.lion },
  sun:{label:'Sun',svg:'<circle cx="12" cy="12" r="5"/><path d="m12 1 2 5h-4zM12 23l-2-5h4zM1 12l5-2v4zM23 12l-5 2v-4zM4 4l5 2-3 3zM20 4l-2 5-3-3zM4 20l2-5 3 3zM20 20l-5-2 3-3z"/>'},
  oak:{retired:true,label:'Oak',svg:'<path d="M11 14h2v8h-2zM8 19h8v2H8z"/><path d="M12 2c3 0 4 2 4 4 4-1 6 3 4 5 4 4-1 8-5 5-1 3-5 3-6 0-4 3-9-1-5-5-2-2 0-6 4-5 0-2 1-4 4-4z"/>'},
  thunder:{label:'Thunderbolt',svg:'<path d="M13 1 4 13h6L8 23l12-15h-7l3-7z"/>'},
  lambda: { retired: true, label: 'Lambda', svg: '<path d="M10.5 3h3L22 21h-4L12 8 6 21H2z"/>' },
  gladius: { label: 'Gladius', svg: '<path d="M10 2h4l1 9-3 4-3-4z"/><rect x="6" y="14" width="12" height="2.5" rx="1"/><path d="M10.5 16h3v4h-3z"/><ellipse cx="12" cy="21" rx="2.5" ry="1.5"/>' },
  legion: { label: 'Legion standard', svg: '<path d="M11 2h2v21h-2zM4 6h16v3H4zM6 10h12v7l-6 3-6-3z"/><circle cx="12" cy="3" r="2.5"/>' },
  column: { retired: true, label: 'Column', svg: '<path d="M3 3h18v3H3zM5 7h14v2H5zM6 20h12v2H6zM3 22h18v2H3zM7 9h2v10H7zM11 9h2v10h-2zM15 9h2v10h-2z"/>' },
  amphora: { retired: true, label: 'Amphora', svg: '<path d="M8 2h8v2h-1v4q4 3 3 7l-4 6H10l-4-6q-1-4 3-7V4H8zM9 22h6v2H9z"/><path d="M8 7C1 5 1 15 7 14M16 7c7-2 7 8 1 7" fill="none" stroke="currentColor" stroke-width="2"/>' },
  horse: { label: 'War horse', svg: CREATURES.horse },
  trident: { label: 'Trident', svg: '<path d="M12 1l2.5 6-1.5-.5v6h3l2-3V7l-2 1 3-6 3 6-2-1v4l-3 4h-4v8h-2v-8H7l-3-4V7L2 8l3-6 3 6-2-1v2.5l2 3h3v-6L9.5 7z"/>' },
  victory: { retired: true, label: 'Victory palm', svg: lineArt('<path d="M10 22Q13 15 13 3M13 8Q8 7 6 3Q12 3 13 8zM13 12Q6 11 3 7Q10 7 13 12zM12 17Q6 17 3 13Q10 13 12 17zM13 7Q13 3 18 1Q18 6 13 7zM13 12Q16 6 21 5Q20 11 13 12zM12 17Q17 11 22 11Q20 17 12 17z"/>') },
  griffin: { label: 'Griffin', svg: CREATURES.griffin },
  phoenix: { label: 'Phoenix', svg: CREATURES.phoenix },
  hydra: { label: 'Hydra', svg: CREATURES.hydra },
  wyvern: { label: 'Wyvern', svg: CREATURES.wyvern },
  twinwyrm: { label: 'Twin hydra', svg: CREATURES.twinwyrm },
  dragon: { label: 'Dragon', svg: CREATURES.dragon },
  serpent: { label: 'Serpent', svg: BEASTS.serpent },
};

// Bots wear a robot instead of an emblem. It isn't offered in the picker, so people can't
// pass themselves off as a bot.
const BOT_EMBLEM = '<rect x="11.2" y="3.2" width="1.6" height="4.6"/><circle cx="12" cy="2.9" r="1.8"/>'
  + '<rect x="1.3" y="11" width="2.2" height="4.6" rx=".9"/><rect x="20.5" y="11" width="2.2" height="4.6" rx=".9"/>'
  + '<path fill-rule="evenodd" d="M5.5 7.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM8.6 11a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM15.4 11a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM8.5 16.9h7v1.5h-7z"/>';

// Retired marks still parse and render for existing players, but aren't shuffled or
// offered to players choosing a new crest.
export const SHAPE_CHOICES = Object.fromEntries(Object.entries(SHAPES).filter(([, shape]) => !shape.retired));
export const EMBLEM_CHOICES = Object.fromEntries(Object.entries(EMBLEMS).filter(([, emblem]) => !emblem.retired));

const KEYS = { shape: SHAPES, color: COLORS, pattern: PATTERNS, emblem: EMBLEMS, metal: METALS, trim: TRIMS };
export const initialOf = name => ([...name.trim()][0] || '').toUpperCase();

export const PARTS = ['shape', 'color', 'pattern', 'emblem', 'metal', 'trim'];

const pick = obj => { const keys = Object.keys(obj); return keys[Math.floor(Math.random() * keys.length)]; };

export function parseCrest(text) {
  const parts = typeof text === 'string' ? text.split('.') : [];
  const crest = {};
  PARTS.forEach((part, i) => { crest[part] = KEYS[part][parts[i]] ? parts[i] : part === 'emblem' ? 'letter' : Object.keys(KEYS[part])[0]; });
  crest.trim = parts[5] === 'none' ? 'basic' : TRIMS[parts[5]] ? parts[5] : defaultTrim(crest.shape);
  // Circular shields share one silhouette; their decoration remains independent.
  if (crest.shape === 'round' || crest.shape === 'targe') crest.shape = 'hoplon';
  return crest;
}

const defaultTrim = shape => SHAPES[shape]?.studs ? 'riveted' : shape === 'hoplon' ? 'double' : 'inset';
export const crestString = crest => PARTS.map(part => part === 'trim' ? (crest.trim === 'none' ? 'basic' : crest.trim || defaultTrim(crest.shape)) : crest[part]).join('.');

export function randomCrest() {
  return { shape: pick(SHAPE_CHOICES), color: pick(COLORS), pattern: pick(PATTERNS), emblem: 'letter', metal: pick(METALS), trim: pick(TRIMS) };
}

// A stable crest for players who never picked one (older clients): a round badge with
// their initial, in a color taken from their id, much like the old circle avatars.
export function defaultCrest(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const colors = Object.keys(COLORS).filter(c => c !== 'sable');
  return { shape: 'hoplon', color: colors[hash % colors.length], pattern: 'plain', emblem: 'letter', metal: hash % 2 ? 'gold' : 'silver', trim: 'inset' };
}

// A bot's crest, worked out from its id so every device draws the same one.
export function botCrest(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const from = obj => { const keys = Object.keys(obj); const k = keys[hash % keys.length]; hash = Math.floor(hash / keys.length); return k; };
  const crest = { shape: from(SHAPE_CHOICES), color: from(COLORS), pattern: from(PATTERNS), emblem: 'bot', metal: from(METALS) };
  return { ...crest, trim: defaultTrim(crest.shape) };
}

const RIVETS = {
  heater: [[10, 8], [24, 8], [38, 8], [38, 21], [34, 32], [24, 40], [14, 32], [10, 21]],
  scutum: [[15, 7], [24, 7], [33, 7], [36, 24], [33, 41], [24, 41], [15, 41], [12, 24]],
  banner: [[11, 7], [24, 7], [37, 7], [37, 23], [37, 39], [24, 33], [11, 39], [11, 23]],
  pennon: [[7, 12], [23, 12], [39, 12], [33, 24], [39, 36], [23, 36], [7, 36], [7, 24]],
  oval: [[24, 6], [33, 11], [37, 24], [33, 37], [24, 42], [15, 37], [11, 24], [15, 11]],
  peltast: [[9, 12], [24, 15], [39, 12], [38, 26], [33, 35], [24, 40], [15, 35], [10, 26]],
  kite: [[24, 6], [35, 9], [38, 19], [33, 30], [24, 41], [15, 30], [10, 19], [13, 9]],
  standard: [[12, 7], [24, 7], [36, 7], [36, 22], [36, 34], [24, 41], [12, 34], [12, 22]],
  tablet: [[11, 7], [24, 7], [37, 7], [39, 24], [37, 41], [24, 41], [11, 41], [9, 24]],
  boeotian: [[24, 6], [34, 9], [37, 14], [31, 24], [37, 34], [24, 42], [11, 34], [17, 24], [11, 14], [14, 9]],
  vexillum: [[10, 8], [24, 8], [38, 8], [38, 23], [38, 38], [24, 41], [10, 38], [10, 23]],
  accolade: [[24, 7], [12, 10], [9, 20], [13, 32], [24, 41], [35, 32], [39, 20], [36, 10]],
  ogee: [[24, 7], [11, 9], [10, 21], [14, 32], [24, 41], [34, 32], [38, 21], [37, 9]],
  scallop: [[24, 7], [12, 9], [10, 19], [10, 30], [24, 41], [38, 30], [38, 19], [36, 9]],
  vesica: [[24, 7], [33, 15], [36, 24], [33, 34], [24, 41], [15, 34], [12, 24], [15, 15]],
  crescent: [[9, 12], [24, 17], [39, 12], [39, 25], [33, 35], [24, 41], [15, 35], [9, 25]],
  cartouche: [[24, 7], [14, 10], [12, 21], [15, 32], [24, 41], [33, 32], [36, 21], [34, 10]]
};

const escape = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// The crest as inline SVG. `letter` is the initial shown by the Letter emblem; `ring`
// draws the lava ring that marks your own seat.
export function crestSvg(crest, { letter = '', ring = false } = {}) {
  const shape = SHAPES[crest.shape];
  const field = COLORS[crest.color].hex;
  const metal = METALS[crest.metal].hex;
  const shade = crest.color === 'sable' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.3)';
  const trim = crest.trim === 'none' ? 'basic' : crest.trim || defaultTrim(crest.shape);
  const { cx, cy } = shape;
  const circle = shape.d === SHAPES.hoplon.d;
  const s = circle ? (trim === 'double' ? .88 : trim === 'riveted' ? .85 : 1.1) : shape.s;
  const inset = shape.rims?.[0] || .85;
  const rims = trim === 'basic' ? [] : trim === 'double' ? (circle ? [.86, .76] : [inset, inset - .1]) : [trim === 'riveted' && circle ? .74 : inset];
  const studs = trim === 'riveted' ? (shape.studs || RIVETS[crest.shape] || SHAPES.targe.studs) : [];
  let emblem;
  if (crest.emblem === 'letter') {
    emblem = letter
      ? `<text x="${cx}" y="${round(cy + 9.4 * s)}" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-style="italic" font-weight="800" font-size="${round(27 * s)}" fill="${metal}">${escape(letter)}</text>`
      : '';
  } else {
    const art = crest.emblem === 'bot' ? BOT_EMBLEM : EMBLEMS[crest.emblem].svg;
    emblem = `<g fill="${metal}" color="${metal}" transform="translate(${round(cx - 12 * s)} ${round(cy - 12 * s)}) scale(${s})">${art}</g>`;
  }
  return `<svg class="crest" viewBox="0 0 48 48" aria-hidden="true">`
    + (ring ? `<path d="${shape.d}" fill="none" stroke="url(#lava-ring)" stroke-width="6" stroke-linejoin="round"/>` : '')
    + `<path d="${shape.d}" fill="${field}"/>`
    + (PATTERNS[crest.pattern].d ? `<path d="${PATTERNS[crest.pattern].d}" fill="${shade}" clip-path="url(#crest-${crest.shape})"/>` : '')
    + rims.map(inset => `<path d="${shape.d}" transform="translate(24 24) scale(${inset}) translate(-24 -24)" fill="none" stroke="${metal}" stroke-opacity=".8" stroke-width="1"/>`).join('')
    + studs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="${metal}"/>`).join('')
    + emblem
    + `<path d="${shape.d}" fill="none" stroke="${metal}" stroke-opacity=".85" stroke-width="1.6" stroke-linejoin="round"/>`
    + '</svg>';
}

// Clip paths (one per shape) and the lava gradient, added once to the page's icon sprite.
export function crestDefs() {
  return '<linearGradient id="lava-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0300B"/><stop offset=".45" stop-color="#FF8A00"/><stop offset="1" stop-color="#FFB23D"/></linearGradient>'
    + Object.entries(SHAPES).map(([key, shape]) => `<clipPath id="crest-${key}"><path d="${shape.d}"/></clipPath>`).join('');
}
