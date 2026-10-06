import { CREATURES } from './crest-creatures.js';
import { MYTHICALS } from './crest-mythicals.js';
import { BEASTS } from './crest-beasts.js';
import { ROMAN } from './crest-roman.js';
import { HERALDIC } from './crest-heraldic.js';

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
  lozenge: { label: 'Lozenge', d: 'M24 3l20 21-20 21L4 24z', cx: 24, cy: 24, s: 0.84 },
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
  pavise: { label: 'Pavise', d: 'M6 43V13Q6 4 15 5Q24 1 33 5Q42 4 42 13V43Q33 40 24 45Q15 40 6 43z', cx: 24, cy: 24, s: .95, rims: [.86], studs: [[10, 12], [38, 12], [10, 38], [38, 38]] },
  spanish: { label: 'Spanish', d: 'M7 5H41V26A17 18.5 0 0 1 7 26Z', cx: 24, cy: 22, s: 1.04 },
  swiss: { label: 'Swiss', d: 'M7 8Q15 3 24 7Q33 3 41 8V22C41 33 33 40 24 44.5C15 40 7 33 7 22Z', cx: 24, cy: 23, s: .98 },
  polish: { label: 'Polish', d: 'M5 4Q11 9 16 6.5Q20 4.5 24 6.5Q28 4.5 32 6.5Q37 9 43 4Q43.5 14 41 22C39.5 34 33 40 24 44.5C15 40 8.5 34 7 22Q4.5 14 5 4Z', cx: 24, cy: 23, s: .96 },
  bouche: { label: 'Bouche', d: 'M8 5H40C42 12 42 22 39.5 30C36 38.5 30 42 24 45C18 42 12 38.5 8.5 30C7.4 27 7 24 7 21Q11.5 20.5 11.5 15.5Q11.5 10.5 7 10Z', cx: 25, cy: 23, s: .96 },
  horsehead: { label: 'Horse-head', d: 'M10 6Q24 1.5 38 6Q36 12 41 17Q38 24 40 31Q34 41 24 45Q14 41 8 31Q10 24 7 17Q12 12 10 6Z', cx: 24, cy: 23, s: .9 },
  ancile: { label: 'Ancile', d: 'M14 4H34Q38.5 4 38.5 9Q38.5 14.5 34 17.5Q31 20 34 23Q38.5 26 38.5 31V39Q38.5 44 34 44H14Q9.5 44 9.5 39V31Q9.5 26 14 23Q17 20 14 17.5Q9.5 14.5 9.5 9Q9.5 4 14 4Z', cx: 24, cy: 24, s: .84 },
  thureos: { label: 'Thureos', d: 'M24 3C34 3 37.5 13 37.5 24C37.5 35 34 45 24 45C14 45 10.5 35 10.5 24C10.5 13 14 3 24 3Z', cx: 24, cy: 24, s: .9 },
  gonfanon: { label: 'Gonfanon', d: 'M7 4H41V30L35.5 44L29.8 33.5L24 44L18.2 33.5L12.5 44L7 30Z', cx: 24, cy: 19.5, s: 1.04 }
};

// Saturated rainbow colors, then common shades. Retired colors still render for
// existing crests but aren't offered.
export const COLORS = {
  crimson: { label: 'Red', hex: '#D7262B' },
  vermilion: { label: 'Vermilion', hex: '#EA4E1B' },
  orange: { label: 'Orange', hex: '#F28C10' },
  amber: { label: 'Amber', hex: '#F6B91A' },
  yellow: { label: 'Yellow', hex: '#F4DD1F' },
  lime: { label: 'Lime', hex: '#9BC92C' },
  green: { label: 'Green', hex: '#2E9E44' },
  teal: { label: 'Teal', hex: '#0E9E8A' },
  cyan: { label: 'Cyan', hex: '#12B0C8' },
  azure: { label: 'Sky blue', hex: '#3A9BE0' },
  blue: { label: 'Blue', hex: '#2556C8' },
  indigo: { label: 'Indigo', hex: '#4338A8' },
  violet: { label: 'Violet', hex: '#7B3FC6' },
  magenta: { label: 'Magenta', hex: '#C02A9A' },
  pink: { label: 'Pink', hex: '#EE6AA7' },
  white: { label: 'White', hex: '#F5F3EE' },
  lightgray: { label: 'Light gray', hex: '#C2C6CC' },
  gray: { label: 'Gray', hex: '#858B95' },
  iron: { label: 'Charcoal', hex: '#42474F' },
  sable: { label: 'Black', hex: '#17181D' },
  cream: { label: 'Cream', hex: '#EEDFB8' },
  sand: { label: 'Tan', hex: '#C9A06A' },
  brown: { label: 'Brown', hex: '#7B4B26' },
  oxblood: { label: 'Maroon', hex: '#7A1F2B' },
  midnight: { label: 'Navy', hex: '#1F2D63' },
  olive: { label: 'Olive', hex: '#7D7F22' },
  pine: { label: 'Forest', hex: '#1F5A33' },
  rust: { retired: true, label: 'Rust', hex: '#C0662B' },
  ochre: { retired: true, label: 'Ochre', hex: '#8F7A14' },
  tyrian: { retired: true, label: 'Tyrian', hex: '#8E2A62' },
  terracotta: { retired: true, label: 'Terracotta', hex: '#AA503D' },
  bronze: { retired: true, label: 'Bronze', hex: '#9A723D' },
  sea: { retired: true, label: 'Sea', hex: '#327E89' },
  plum: { retired: true, label: 'Plum', hex: '#653C78' },
  slate: { retired: true, label: 'Slate', hex: '#606C85' },
  porphyry: { retired: true, label: 'Porphyry', hex: '#754A52' },
  wine: { retired: true, label: 'Wine', hex: '#842F45' },
  ivory: { retired: true, label: 'Ivory', hex: '#BDB6A3' },
  verdigris: { retired: true, label: 'Verdigris', hex: '#468071' },
  lapis: { retired: true, label: 'Lapis', hex: '#314D98' }
};

// Trim metals. Emblems no longer take the metal; they are inked black or white.
export const METALS = {
  gold: { label: 'Gold', hex: '#F2B84B' },
  silver: { label: 'Silver', hex: '#E4E6EF' },
  obsidian: { label: 'Black', hex: '#171A2C' },
  bronze: { retired: true, label: 'Bronze', hex: '#CD9B57' },
  copper: { retired: true, label: 'Copper', hex: '#EFAD8D' },
  platinum: { retired: true, label: 'Platinum', hex: '#BCC9D8' }
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
  ...ROMAN,
  ...MYTHICALS,
  letter: { label: 'Letter' },
  laurel: { label: 'Laurel', svg: laurel() },
  crown: { label: 'Crown', svg: HERALDIC.crown },
  star: { retired: true, label: 'Star', svg: starPath() },
  sword: { label: 'Sword', svg: '<path d="M12 1.5l1.4 2.4V15h-2.8V3.9z"/><rect x="6" y="15" width="12" height="2.2" rx="1.1"/><rect x="11" y="17" width="2" height="3.6"/><circle cx="12" cy="21.6" r="1.6"/>' },
  tower: { retired: true, label: 'Tower', svg: '<path fill-rule="evenodd" d="M5 22V8h3V5h2.5v3h3V5H16v3h3v14zM10 22v-4.5a2 2 0 0 1 4 0V22z"/>' },
  helm: { label: 'Helm', svg: CREATURES.helm },
  moon: { retired: true, label: 'Moon', svg: '<path d="M16.1 4A9 9 0 1 0 16.1 20A8 8 0 1 1 16.1 4z"/>' },
  cross: { label: 'Cross', svg: HERALDIC.cross },
  botonny: { label: 'Botonny cross', svg: HERALDIC.botonny },
  maltese: { label: 'Maltese cross', svg: HERALDIC.maltese },
  eagle: { label: 'Eagle', svg: HERALDIC.eagle },
  spartan: { label: 'Spartan', svg: CREATURES.spartan },
  spears: { label: 'Spears', svg: HERALDIC.spears },
  axe:{label:'Axe',svg:'<path d="M11 2h2v21h-2zM13 4q6 0 9-3v10q-4-4-9-4zM11 4Q5 4 2 1v10q4-4 9-4z"/>'},
  wolf: { label: 'Wolf', svg: BEASTS.wolf.svg },
  lion: { label: 'Lion', svg: CREATURES.lion },
  sun: { label: 'Sun', svg: HERALDIC.sun },
  oak:{retired:true,label:'Oak',svg:'<path d="M11 14h2v8h-2zM8 19h8v2H8z"/><path d="M12 2c3 0 4 2 4 4 4-1 6 3 4 5 4 4-1 8-5 5-1 3-5 3-6 0-4 3-9-1-5-5-2-2 0-6 4-5 0-2 1-4 4-4z"/>'},
  thunder:{label:'Thunderbolt',svg:'<path d="M13 1 4 13h6L8 23l12-15h-7l3-7z"/>'},
  lambda: { retired: true, label: 'Lambda', svg: '<path d="M10.5 3h3L22 21h-4L12 8 6 21H2z"/>' },
  gladius: { label: 'Gladius', svg: HERALDIC.gladius },
  legion: { retired: true, label: 'Legion standard', svg: '<path d="M11 2h2v21h-2zM4 6h16v3H4zM6 10h12v7l-6 3-6-3z"/><circle cx="12" cy="3" r="2.5"/>' },
  column: { retired: true, label: 'Column', svg: '<path d="M3 3h18v3H3zM5 7h14v2H5zM6 20h12v2H6zM3 22h18v2H3zM7 9h2v10H7zM11 9h2v10h-2zM15 9h2v10h-2z"/>' },
  amphora: { retired: true, label: 'Amphora', svg: '<path d="M8 2h8v2h-1v4q4 3 3 7l-4 6H10l-4-6q-1-4 3-7V4H8zM9 22h6v2H9z"/><path d="M8 7C1 5 1 15 7 14M16 7c7-2 7 8 1 7" fill="none" stroke="currentColor" stroke-width="2"/>' },
  horse: { label: 'War horse', svg: CREATURES.horse },
  trident: { label: 'Trident', svg: '<path d="M12 1l2.5 6-1.5-.5v6h3l2-3V7l-2 1 3-6 3 6-2-1v4l-3 4h-4v8h-2v-8H7l-3-4V7L2 8l3-6 3 6-2-1v2.5l2 3h3v-6L9.5 7z"/>' },
  victory: { retired: true, label: 'Victory palm', svg: lineArt('<path d="M10 22Q13 15 13 3M13 8Q8 7 6 3Q12 3 13 8zM13 12Q6 11 3 7Q10 7 13 12zM12 17Q6 17 3 13Q10 13 12 17zM13 7Q13 3 18 1Q18 6 13 7zM13 12Q16 6 21 5Q20 11 13 12zM12 17Q17 11 22 11Q20 17 12 17z"/>') },
  griffin: { label: 'Griffin', svg: HERALDIC.griffin },
  phoenix: { label: 'Phoenix', svg: CREATURES.phoenix },
  hydra: { label: 'Hydra', svg: CREATURES.hydra },
  wyvern: { label: 'Wyvern', svg: CREATURES.wyvern },
  twinwyrm: { label: 'Twin hydra', svg: CREATURES.twinwyrm },
  dragon: { label: 'Dragon', svg: CREATURES.dragon },
  serpent: { label: 'Serpent', svg: BEASTS.serpent.svg },
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
export const COLOR_CHOICES = Object.fromEntries(Object.entries(COLORS).filter(([, color]) => !color.retired));
export const METAL_CHOICES = Object.fromEntries(Object.entries(METALS).filter(([, metal]) => !metal.retired));

// Every option for each part, retired ones included, so saved crests always resolve.
export const PART_OPTIONS = { shape: SHAPES, color: COLORS, pattern: PATTERNS, emblem: EMBLEMS, metal: METALS, trim: TRIMS };
export const initialOf = name => ([...name.trim()][0] || '').toUpperCase();

export const PARTS = ['shape', 'color', 'pattern', 'emblem', 'metal', 'trim'];

const pick = obj => { const keys = Object.keys(obj); return keys[Math.floor(Math.random() * keys.length)]; };

export function parseCrest(text) {
  const parts = typeof text === 'string' ? text.split('.') : [];
  const crest = {};
  PARTS.forEach((part, i) => { crest[part] = PART_OPTIONS[part][parts[i]] ? parts[i] : part === 'emblem' ? 'letter' : Object.keys(PART_OPTIONS[part])[0]; });
  crest.trim = parts[5] === 'none' ? 'basic' : TRIMS[parts[5]] ? parts[5] : defaultTrim(crest.shape);
  // Circular shields share one silhouette; their decoration remains independent.
  if (crest.shape === 'round' || crest.shape === 'targe') crest.shape = 'hoplon';
  return crest;
}

const defaultTrim = shape => SHAPES[shape]?.studs ? 'riveted' : shape === 'hoplon' ? 'double' : 'inset';
export const crestString = crest => PARTS.map(part => part === 'trim' ? (crest.trim === 'none' ? 'basic' : crest.trim || defaultTrim(crest.shape)) : crest[part]).join('.');

export function randomCrest() {
  return { shape: pick(SHAPE_CHOICES), color: pick(COLOR_CHOICES), pattern: pick(PATTERNS), emblem: 'letter', metal: pick(METAL_CHOICES), trim: pick(TRIMS) };
}

// A stable crest for players who never picked one (older clients): a round badge with
// their initial, in a color taken from their id, much like the old circle avatars.
export function defaultCrest(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const colors = Object.keys(COLOR_CHOICES).filter(c => c !== 'sable');
  return { shape: 'hoplon', color: colors[hash % colors.length], pattern: 'plain', emblem: 'letter', metal: hash % 2 ? 'gold' : 'silver', trim: 'inset' };
}

// A bot's crest, worked out from its id so every device draws the same one.
export function botCrest(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const from = obj => { const keys = Object.keys(obj); const k = keys[hash % keys.length]; hash = Math.floor(hash / keys.length); return k; };
  const crest = { shape: from(SHAPE_CHOICES), color: from(COLOR_CHOICES), pattern: from(PATTERNS), emblem: 'bot', metal: from(METAL_CHOICES) };
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
  cartouche: [[24, 7], [14, 10], [12, 21], [15, 32], [24, 41], [33, 32], [36, 21], [34, 10]],
  spanish: [[10, 8], [24, 8], [38, 8], [38, 23], [34, 35], [24, 41], [14, 35], [10, 23]],
  swiss: [[10, 10], [24, 10], [38, 10], [38, 21], [34, 32], [24, 40.5], [14, 32], [10, 21]],
  polish: [[8.5, 9], [24, 9.5], [39.5, 9], [38.5, 20], [34, 32], [24, 41], [14, 32], [9.5, 20]],
  bouche: [[14, 8], [24, 8], [37.5, 8], [38, 21], [34, 33], [24, 41.5], [14, 33], [10.5, 24]],
  horsehead: [[14, 8], [24, 6.5], [34, 8], [36.5, 24], [32, 35.5], [24, 41], [16, 35.5], [11.5, 24]],
  ancile: [[14, 7], [34, 7], [35.5, 11], [35.5, 37], [34, 41], [14, 41], [12.5, 37], [12.5, 11]],
  thureos: [[24, 6], [32, 11.5], [34.5, 24], [32, 36.5], [24, 42], [16, 36.5], [13.5, 24], [16, 11.5]],
  lozenge: [[24, 7], [32, 15.5], [40, 24], [32, 32.5], [24, 41], [16, 32.5], [8, 24], [16, 15.5]],
  gonfanon: [[10, 7], [24, 7], [38, 7], [38, 19], [38, 29], [24, 30.5], [10, 29], [10, 19]]
};

// Emblems are inked black, or white where the field is too dark for black to reach
// the 3:1 contrast that graphics need.
const INK = { dark: '#15161C', light: '#F5F3EE' };
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
export const inkFor = hex => (luminance(hex) + .05) / (luminance(INK.dark) + .05) >= 3 ? INK.dark : INK.light;

const escape = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// The crest as inline SVG. `letter` is the initial shown by the Letter emblem; `ring`
// draws the lava ring that marks your own seat.
export function crestSvg(crest, { letter = '', ring = false } = {}) {
  const shape = SHAPES[crest.shape];
  const field = COLORS[crest.color].hex;
  const metal = METALS[crest.metal].hex;
  const ink = inkFor(field);
  const shade = ink === INK.light ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.3)';
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
      ? `<text x="${cx}" y="${round(cy + 9.4 * s)}" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-style="italic" font-weight="800" font-size="${round(27 * s)}" fill="${ink}">${escape(letter)}</text>`
      : '';
  } else {
    const art = crest.emblem === 'bot' ? BOT_EMBLEM : EMBLEMS[crest.emblem].svg;
    emblem = `<g fill="${ink}" color="${ink}" transform="translate(${round(cx - 12 * s)} ${round(cy - 12 * s)}) scale(${s})">${art}</g>`;
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
