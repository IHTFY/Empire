import { EMBLEM_ART } from './crest-emblems.js';
import { SHAPE_GEOMETRY } from './crest-geometry.js';

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
  hoplon: { label: 'Hoplon', d: 'M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z', cx: 24, cy: 24, s: .88 },
  peltast: { label: 'Pelta', d:'M5 6Q24 19 43 6V23Q41 38 24 44Q7 38 5 23z', cx:24, cy:27, s:.92 },
  kite: { label: 'Kite', d:'M24 3Q43 3 42 17Q39 33 24 45Q9 33 6 17Q5 3 24 3z', cx:24, cy:20, s:1 },
  hexagon: { retired: true, label: 'Hexagon', d:'M14 4h20l11 20-11 20H14L3 24z', cx:24, cy:24, s:1.04 },
  standard: { label: 'Standard', d:'M9 4h30v32L24 45 9 36z', cx:24, cy:22, s:1 },
  tablet: { label: 'Tablet', d: 'M10 4h28q4 0 4 4v32q0 4-4 4H10q-4 0-4-4V8q0-4 4-4z', cx: 24, cy: 24, s: 1.1 },
  boeotian: { label: 'Boeotian', d: 'M24 3Q39 3 42 15Q31 24 42 33Q39 45 24 45Q9 45 6 33Q17 24 6 15Q9 3 24 3z', cx: 24, cy: 24, s: .84 },
  octagon: { retired: true, label: 'Octagon', d: 'M15 4h18l11 11v18L33 44H15L4 33V15z', cx: 24, cy: 24, s: 1.08 },
  vexillum: { label: 'Vexillum', d: 'M7 5h34v38l-10-5-7 7-7-7-10 5z', cx: 24, cy: 21, s: 1.02 },
  accolade: { label: 'Accolade', d: 'M24 3Q18 9 7 6Q10 13 5 18C5 32 15 39 24 45C33 39 43 32 43 18Q38 13 41 6Q30 9 24 3z', cx: 24, cy: 23, s: .91 },
  ogee: { label: 'Ogee', d: 'M6 5Q15 9 24 3Q33 9 42 5C39 13 44 18 40 28C36 38 28 39 24 45C20 39 12 38 8 28C4 18 9 13 6 5z', cx: 24, cy: 23, s: .91 },
  scallop: { label: 'Scalloped', d: 'M24 3C28 9 34 4 39 6C37 12 45 12 42 18C48 25 40 28 40 32Q33 39 24 45Q15 39 8 32C8 28 0 25 6 18C3 12 11 12 9 6C14 4 20 9 24 3z', cx: 24, cy: 23, s: .9 },
  targe: { retired: true, label: 'Targe', d: 'M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z', cx: 24, cy: 24, s: .85 },
  vesica: { label: 'Vesica', d: 'M24 3C44 13 44 34 24 45C4 34 4 13 24 3z', cx: 24, cy: 24, s: .82 },
  crescent: { label: 'Amazon', d: 'M5 5Q24 22 43 5C47 21 40 39 24 45C8 39 1 21 5 5z', cx: 24, cy: 29, s: .76 },
  cartouche: { label: 'Cartouche', d: 'M24 3C29 9 33 4 39 7C33 14 44 15 40 22C46 28 36 30 37 36Q28 39 24 45Q20 39 11 36C12 30 2 28 8 22C4 15 15 14 9 7C15 4 19 9 24 3z', cx: 24, cy: 24, s: .79 },
  pavise: { label: 'Pavise', d: 'M6 43V13Q6 4 15 5Q24 1 33 5Q42 4 42 13V43Q33 40 24 45Q15 40 6 43z', cx: 24, cy: 24, s: .95 },
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

// Each trim's inner borders, as distances in from the outline. Riveted shields also carry
// studs on the line nearer the edge (crest-geometry.js).
export const TRIMS = {
  basic: { label: 'Basic', rims: [] },
  inset: { label: 'Inset', rims: [3] },
  double: { label: 'Double', rims: [2.7, 4.8] },
  riveted: { label: 'Riveted', rims: [4.8] }
};

const round = n => Math.round(n * 100) / 100;

// Divisions of the field, drawn as a shade of the field color. Each is laid out on the
// shape: centered on the emblem's point (cx, cy), with the chief and base cut from the
// shape's own top and bottom. E and F reach past the 48 × 48 box; the shape clips them.
const E = -24, F = 72;
const band = (cx, cy, dx, dy, w) => {
  const nx = -dy * w / 2, ny = dx * w / 2;
  const at = (t, side) => `${round(cx + dx * t + nx * side)} ${round(cy + dy * t + ny * side)}`;
  return `M${at(-60, 1)}L${at(60, 1)} ${at(60, -1)} ${at(-60, -1)}z`;
};
const repeat = (from, step, fn) => Array.from({ length: Math.ceil((F - E) / step) + 1 }, (_, i) => fn(from + (Math.floor((E - from) / step) + i) * step)).join('');
export const PATTERNS = {
  plain: { label: 'Plain' },
  pale: { label: 'Per pale', d: ({ cx }) => `M${cx} ${E}H${F}V${F}H${cx}z` },
  bend: { label: 'Per bend', d: ({ cx, cy }) => `M${cx - 60} ${cy - 60}H${cx + 60}V${cy + 60}z` },
  chief: { label: 'Chief', d: ({ box: [, top, , bottom] }) => `M${E} ${E}H${F}V${round(top + (bottom - top) * .3)}H${E}z` },
  chevron: { label: 'Chevron', d: ({ cx, cy }) => `M${cx - 60} ${cy + 63}L${cx} ${cy - 2}l60 65z` },
  quarterly: { label: 'Quarterly', d: ({ cx, cy }) => `M${E} ${E}H${cx}V${cy}H${E}zM${cx} ${cy}H${F}V${F}H${cx}z` },
  cross: { label: 'Cross', d: ({ cx, cy }) => `M${cx - 4} ${E}h8V${F}h-8zM${E} ${cy - 4}H${F}v8H${E}z` },
  saltire: { label: 'Saltire', d: ({ cx, cy }) => band(cx, cy, Math.SQRT1_2, Math.SQRT1_2, 8) + band(cx, cy, Math.SQRT1_2, -Math.SQRT1_2, 8) },
  meander: { label: 'Greek key', d: ({ cx, cy }) => repeat(cx - 24, 16, x => `M${x} ${cy - 7}h15v14h-12v-10h8v6h-4v-2h2v-2h-4v6h8v-10h-13z`) },
  fluted: { label: 'Fluted', d: ({ cx }) => repeat(cx - 18, 22, x => `M${x} ${E}h4V${F}h-4zM${x + 10} ${E}h4V${F}h-4z`) },
  striped: { label: 'Striped', d: ({ cy }) => repeat(cy - 3, 15, y => `M${E} ${y}H${F}v6H${E}z`) },
  chequer: { label: 'Chequered', d: ({ cx, cy }) => repeat(cy, 12, y => repeat(cx + ((y - cy) / 12 % 2 ? 12 : 0), 24, x => `M${x} ${y}h12v12h-12z`)) },
  gyronny: { label: 'Radiant', d: ({ cx, cy }) => `M${cx} ${cy}l-60-60h60zM${cx} ${cy}l60-60v60zM${cx} ${cy}l60 60h-60zM${cx} ${cy}l-60 60v-60z` },
  lozengy: { label: 'Diamonds', d: ({ cx, cy }) => repeat(cy - 24, 24, y => repeat(cx - 12, 24, x => `M${x} ${y}l12 12-12 12-12-12z`)) },
  fess: { label: 'Fess', d: ({ cy, box: [, top, , bottom] }) => `M${E} ${round(cy - (bottom - top) * .16)}H${F}v${round((bottom - top) * .32)}H${E}z` },
  base: { label: 'Base', d: ({ box: [, top, , bottom] }) => `M${E} ${round(bottom - (bottom - top) * .33)}H${F}V${F}H${E}z` }
};

function starPath() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.4 : 10.5;
    const a = (-90 + i * 36) * Math.PI / 180;
    pts.push(`${round(12 + r * Math.cos(a))} ${round(12.6 + r * Math.sin(a))}`);
  }
  return `<path d="M${pts.join('L')}z"/>`;
}

const lineArt = art => `<g fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${art}</g>`;

export const EMBLEMS = {
  aquila: { label: 'Roman eagle', svg: EMBLEM_ART.aquila },
  ouroboros: { label: 'Ouroboros', svg: EMBLEM_ART.ouroboros },
  medusa: { label: 'Medusa', svg: EMBLEM_ART.medusa },
  pegasus: { label: 'Pegasus', svg: EMBLEM_ART.pegasus },
  doubleeagle: { label: 'Double-headed eagle', svg: EMBLEM_ART.doubleeagle },
  minotaur: { label: 'Minotaur', svg: EMBLEM_ART.minotaur },
  unicorn: { label: 'Unicorn', svg: EMBLEM_ART.unicorn },
  letter: { label: 'Letter' },
  laurel: { label: 'Laurel', svg: EMBLEM_ART.laurel },
  crown: { label: 'Crown', svg: EMBLEM_ART.crown },
  star: { retired: true, label: 'Star', svg: starPath() },
  sword: { label: 'Sword', svg: EMBLEM_ART.sword },
  tower: { retired: true, label: 'Tower', svg: '<path fill-rule="evenodd" d="M5 22V8h3V5h2.5v3h3V5H16v3h3v14zM10 22v-4.5a2 2 0 0 1 4 0V22z"/>' },
  helm: { label: 'Helm', svg: EMBLEM_ART.helm },
  moon: { retired: true, label: 'Moon', svg: '<path d="M16.1 4A9 9 0 1 0 16.1 20A8 8 0 1 1 16.1 4z"/>' },
  cross: { label: 'Cross', svg: EMBLEM_ART.cross },
  botonny: { label: 'Botonny cross', svg: EMBLEM_ART.botonny },
  maltese: { label: 'Maltese cross', svg: EMBLEM_ART.maltese },
  eagle: { retired: true, label: 'Eagle', svg: EMBLEM_ART.eagle },
  spartan: { label: 'Spartan', svg: EMBLEM_ART.spartan },
  spears: { label: 'Spears', svg: EMBLEM_ART.spears },
  axe: { label: 'Axe', svg: EMBLEM_ART.axe },
  wolf: { label: 'Wolf', svg: EMBLEM_ART.wolf },
  lion: { label: 'Lion', svg: EMBLEM_ART.lion },
  sun: { label: 'Sun', svg: EMBLEM_ART.sun },
  oak:{retired:true,label:'Oak',svg:'<path d="M11 14h2v8h-2zM8 19h8v2H8z"/><path d="M12 2c3 0 4 2 4 4 4-1 6 3 4 5 4 4-1 8-5 5-1 3-5 3-6 0-4 3-9-1-5-5-2-2 0-6 4-5 0-2 1-4 4-4z"/>'},
  thunder: { label: 'Thunderbolt', svg: EMBLEM_ART.thunder },
  lambda: { retired: true, label: 'Lambda', svg: '<path d="M10.5 3h3L22 21h-4L12 8 6 21H2z"/>' },
  gladius: { label: 'Gladius', svg: EMBLEM_ART.gladius },
  legion: { retired: true, label: 'Legion standard', svg: '<path d="M11 2h2v21h-2zM4 6h16v3H4zM6 10h12v7l-6 3-6-3z"/><circle cx="12" cy="3" r="2.5"/>' },
  column: { retired: true, label: 'Column', svg: '<path d="M3 3h18v3H3zM5 7h14v2H5zM6 20h12v2H6zM3 22h18v2H3zM7 9h2v10H7zM11 9h2v10h-2zM15 9h2v10h-2z"/>' },
  amphora: { retired: true, label: 'Amphora', svg: '<path d="M8 2h8v2h-1v4q4 3 3 7l-4 6H10l-4-6q-1-4 3-7V4H8zM9 22h6v2H9z"/><path d="M8 7C1 5 1 15 7 14M16 7c7-2 7 8 1 7" fill="none" stroke="currentColor" stroke-width="2"/>' },
  horse: { label: 'War horse', svg: EMBLEM_ART.horse },
  trident: { label: 'Trident', svg: EMBLEM_ART.trident },
  victory: { retired: true, label: 'Victory palm', svg: lineArt('<path d="M10 22Q13 15 13 3M13 8Q8 7 6 3Q12 3 13 8zM13 12Q6 11 3 7Q10 7 13 12zM12 17Q6 17 3 13Q10 13 12 17zM13 7Q13 3 18 1Q18 6 13 7zM13 12Q16 6 21 5Q20 11 13 12zM12 17Q17 11 22 11Q20 17 12 17z"/>') },
  griffin: { label: 'Griffin', svg: EMBLEM_ART.griffin },
  phoenix: { label: 'Phoenix', svg: EMBLEM_ART.phoenix },
  hydra: { label: 'Hydra', svg: EMBLEM_ART.hydra },
  wyvern: { label: 'Wyvern', svg: EMBLEM_ART.wyvern },
  twinwyrm: { label: 'Twin hydra', svg: EMBLEM_ART.twinwyrm },
  dragon: { label: 'Dragon', svg: EMBLEM_ART.dragon },
  serpent: { label: 'Serpent', svg: EMBLEM_ART.serpent },
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

const defaultTrim = shape => shape === 'pavise' || shape === 'targe' ? 'riveted' : shape === 'hoplon' ? 'double' : 'inset';
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
  const geometry = { ...SHAPE_GEOMETRY[crest.shape], cx, cy };
  const { rims } = TRIMS[trim];
  const studs = trim === 'riveted' ? geometry.rivets : [];
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
    + (PATTERNS[crest.pattern].d ? `<path d="${PATTERNS[crest.pattern].d(geometry)}" fill="${shade}" clip-path="url(#crest-${crest.shape})"/>` : '')
    // The borders are one wide stroke, masked down to lines at their exact distance from the edge.
    + (rims.length ? `<path d="${shape.d}" fill="none" stroke="${metal}" stroke-opacity=".8" stroke-width="${rimWidth(rims)}" stroke-linejoin="round" clip-path="url(#crest-${crest.shape})" mask="url(#crest-${crest.shape}-${trim})"/>` : '')
    + studs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="${metal}"/>`).join('')
    + emblem
    + `<path d="${shape.d}" fill="none" stroke="${metal}" stroke-opacity=".85" stroke-width="1.6" stroke-linejoin="round"/>`
    + '</svg>';
}

const RIM_LINE = 1;
const rimWidth = rims => 2 * Math.max(...rims) + RIM_LINE;

// Clip paths and border masks (per shape) and the lava gradient, added once to the page's icon sprite.
export function crestDefs() {
  // A stroke of width 2d covers everything within d of the outline. Painting the borders
  // from the innermost out, white to each line's far side and black to its near side,
  // leaves one band per border.
  const stroke = (d, color, width) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
  return '<linearGradient id="lava-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0300B"/><stop offset=".45" stop-color="#FF8A00"/><stop offset="1" stop-color="#FFB23D"/></linearGradient>'
    + Object.entries(SHAPES).map(([key, shape]) => `<clipPath id="crest-${key}"><path d="${shape.d}"/></clipPath>`
      + Object.entries(TRIMS).filter(([, trim]) => trim.rims.length).map(([trim, { rims }]) => `<mask id="crest-${key}-${trim}" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">`
        + [...rims].reverse().map(d => stroke(shape.d, 'white', 2 * d + RIM_LINE) + stroke(shape.d, 'black', 2 * d - RIM_LINE)).join('')
        + '</mask>').join('')).join('');
}
