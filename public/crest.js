// Crests: each player's avatar is a small coat of arms built from five choices.
// A crest is stored as one short string, "shape.color.pattern.emblem.metal", e.g.
// "heater.crimson.chevron.crown.gold". Unknown parts fall back to defaults, so older
// or newer clients never break each other.

// Every shape sits inside a 48 × 48 box, inset so the "you" ring fits around it.
// cx/cy/s place the emblem (drawn on a 24 × 24 grid) inside the shape.
export const SHAPES = {
  round: { label: 'Round', d: 'M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z', cx: 24, cy: 24, s: 1.1 },
  heater: { label: 'Shield', d: 'M7 5h34v16c0 12-8 19-17 23C15 40 7 33 7 21z', cx: 24, cy: 21, s: 1.02 },
  scutum: { label: 'Scutum', d: 'M12.5 4h23c3.6 6 3.6 34 0 40h-23c-3.6-6-3.6-34 0-40z', cx: 24, cy: 24, s: 1 },
  lozenge: { label: 'Lozenge', d: 'M24 3l20 21-20 21L4 24z', cx: 24, cy: 24, s: 0.84 },
  banner: { label: 'Banner', d: 'M8 4h32v40l-16-8-16 8z', cx: 24, cy: 19.5, s: 1.02 },
  pennon: { label: 'Pennon', d: 'M4 9h40l-8 15 8 15H4z', cx: 19.5, cy: 24, s: 0.94 },
  oval: { label: 'Oval', d: 'M24 3a16 21 0 1 1 0 42a16 21 0 1 1 0-42z', cx:24, cy:24, s:1 },
  hoplon: { label: 'Hoplon', d: 'M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z M24 7a17 17 0 1 0 0 34a17 17 0 1 0 0-34z M24 9a15 15 0 1 1 0 30a15 15 0 1 1 0-30z', cx:24, cy:24, s:.94 },
  peltast: { label: 'Pelta', d:'M5 6Q24 19 43 6V23Q41 38 24 44Q7 38 5 23z', cx:24, cy:27, s:.92 },
  kite: { label: 'Kite', d:'M24 3Q43 3 42 17Q39 33 24 45Q9 33 6 17Q5 3 24 3z', cx:24, cy:20, s:1 },
  hexagon: { label: 'Hexagon', d:'M14 4h20l11 20-11 20H14L3 24z', cx:24, cy:24, s:1.04 },
  standard: { label: 'Standard', d:'M9 4h30v32L24 45 9 36z', cx:24, cy:22, s:1 },
  tablet: { label: 'Tablet', d: 'M10 4h28q4 0 4 4v32q0 4-4 4H10q-4 0-4-4V8q0-4 4-4z', cx: 24, cy: 24, s: 1.1 },
  boeotian: { label: 'Boeotian', d: 'M24 3Q39 3 42 15Q31 24 42 33Q39 45 24 45Q9 45 6 33Q17 24 6 15Q9 3 24 3z', cx: 24, cy: 24, s: .84 },
  octagon: { label: 'Octagon', d: 'M15 4h18l11 11v18L33 44H15L4 33V15z', cx: 24, cy: 24, s: 1.08 },
  vexillum: { label: 'Vexillum', d: 'M7 5h34v38l-10-5-7 7-7-7-10 5z', cx: 24, cy: 21, s: 1.02 }
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

export const EMBLEMS = {
  letter: { label: 'Letter' },
  laurel: { label: 'Laurel', svg: laurel() },
  crown: { label: 'Crown', svg: '<path d="M3.5 17.5 2.5 7l5 4L12 4l4.5 7 5-4-1 10.5z"/><rect x="3.5" y="19" width="17" height="2.6" rx="1"/>' },
  star: { label: 'Star', svg: starPath() },
  sword: { label: 'Sword', svg: '<path d="M12 1.5l1.4 2.4V15h-2.8V3.9z"/><rect x="6" y="15" width="12" height="2.2" rx="1.1"/><rect x="11" y="17" width="2" height="3.6"/><circle cx="12" cy="21.6" r="1.6"/>' },
  tower: { label: 'Tower', svg: '<path fill-rule="evenodd" d="M5 22V8h3V5h2.5v3h3V5H16v3h3v14zM10 22v-4.5a2 2 0 0 1 4 0V22z"/>' },
  helm: { label: 'Helm', svg: '<path fill-rule="evenodd" d="M5.5 21.5V10c0-4.4 2.9-7.5 6.5-7.5s6.5 3.1 6.5 7.5v11.5zM7.8 10.2h8.4v1.9H7.8zM11.2 14h1.6v5.5h-1.6z"/>' },
  moon: { label: 'Moon', svg: '<path d="M16.1 4A9 9 0 1 0 16.1 20A8 8 0 1 1 16.1 4z"/>' },
  cross: { label: 'Cross', svg: '<path d="M9 2h6l-1.5 8.5L22 9v6l-8.5-1.5L15 22H9l1.5-8.5L2 15V9l8.5 1.5z"/>' },
  eagle:{label:'Eagle',svg:'<path d="M10 8V5q0-3 3-3h2l2 3h-4v3l2 2 7-6v5l-5 4 5-2v3l-6 2 5 1-2 3-5-3 2 5h-8l2-5-5 3-2-3 5-1-6-2v-3l5 2-5-4V4l7 6z"/>'},
  spartan:{label:'Spartan',svg:'<path d="M5 8C5 2 17 0 20 7L16 8C13 4 8 5 8 8z"/><path fill-rule="evenodd" d="M6 21V11C6 6 18 6 18 11v10l-4-3v-5h-4v5zM8 10v2h3v-2zM13 10v2h3v-2z"/><path d="M11 11h2v11h-2z"/>'},
  spears:{label:'Spears',svg:'<g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m5 21 13-15M19 21 6 6"/></g><path d="m16 7 1-6 5 1-4 7zM8 7 7 1 2 2l4 7z"/>'},
  axe:{label:'Axe',svg:'<path d="M11 2h2v21h-2zM13 4q6 0 9-3v10q-4-4-9-4zM11 4Q5 4 2 1v10q4-4 9-4z"/>'},
  wolf:{label:'Wolf',svg:'<path fill-rule="evenodd" d="m4 2 6 4h4l6-4-1 12-7 9-7-9zM6 10l4 3v-2zM18 10l-4 3v-2zM10 16l2 3 2-3z"/>'},
  lion:{label:'Lion',svg:'<path fill-rule="evenodd" d="m12 1 4 3 4 1 1 5 2 4-4 3-2 5-5-2-5 2-2-5-4-3 2-4 1-5 4-1zM7 8v7l5 4 5-4V8l-5-3z"/><path d="M8 10h3l-1 2zM13 10h3l-2 2zM10 14h4l-2 3z"/>'},
  sun:{label:'Sun',svg:'<circle cx="12" cy="12" r="5"/><path d="m12 1 2 5h-4zM12 23l-2-5h4zM1 12l5-2v4zM23 12l-5 2v-4zM4 4l5 2-3 3zM20 4l-2 5-3-3zM4 20l2-5 3 3zM20 20l-5-2 3-3z"/>'},
  oak:{label:'Oak',svg:'<path d="M11 14h2v8h-2zM8 19h8v2H8z"/><path d="M12 2c3 0 4 2 4 4 4-1 6 3 4 5 4 4-1 8-5 5-1 3-5 3-6 0-4 3-9-1-5-5-2-2 0-6 4-5 0-2 1-4 4-4z"/>'},
  thunder:{label:'Thunderbolt',svg:'<path d="M13 1 4 13h6L8 23l12-15h-7l3-7z"/>'},
  lambda: { label: 'Lambda', svg: '<path d="M10.5 3h3L22 21h-4L12 8 6 21H2z"/>' },
  gladius: { label: 'Gladius', svg: '<path d="M10 2h4l1 9-3 4-3-4z"/><rect x="6" y="14" width="12" height="2.5" rx="1"/><path d="M10.5 16h3v4h-3z"/><ellipse cx="12" cy="21" rx="2.5" ry="1.5"/>' },
  legion: { label: 'Legion standard', svg: '<path d="M11 2h2v21h-2zM4 6h16v3H4zM6 10h12v7l-6 3-6-3z"/><circle cx="12" cy="3" r="2.5"/>' },
  column: { label: 'Column', svg: '<path d="M3 3h18v3H3zM5 7h14v2H5zM6 20h12v2H6zM3 22h18v2H3zM7 9h2v10H7zM11 9h2v10h-2zM15 9h2v10h-2z"/>' },
  amphora: { label: 'Amphora', svg: '<path d="M8 2h8v2h-1v4q4 3 3 7l-4 6H10l-4-6q-1-4 3-7V4H8zM9 22h6v2H9z"/><path d="M8 7C1 5 1 15 7 14M16 7c7-2 7 8 1 7" fill="none" stroke="currentColor" stroke-width="2"/>' },
  horse: { label: 'War horse', svg: '<path d="m7 22 1-6-4-2 2-7 5-3 2-3 2 4 4 2 3 7-4 1-3-5-2 5 4 7z"/><path d="M9 3 6 4 3 11l3-1 3-5z"/>' },
  trident: { label: 'Trident', svg: '<path d="m12 1 3 5h-2v7q5 0 5-5h-2l3-5 3 5h-2q0 7-7 7v8h-2v-8Q4 15 4 8H2l3-5 3 5H6q0 5 5 5V6H9z"/>' },
  victory: { label: 'Victory palm', svg: '<path d="M11 23h2V5h-2zM12 17Q3 17 2 9q7 0 10 8zM12 12Q4 12 4 4q6 1 8 8zM12 17q9 0 10-8-7 0-10 8zM12 12q8 0 8-8-6 1-8 8zM12 7Q8 3 12 0q4 3 0 7z"/>' },
  serpent: { label: 'Serpent', svg: '<path d="M17 4c-6-5-16 2-10 8l8 4c4 2 0 7-4 5l-3-2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="m14 2 6 1 2 4-6 2-3-3z"/>' }
};

// Bots wear a robot instead of an emblem. It isn't offered in the picker, so people can't
// pass themselves off as a bot.
const BOT_EMBLEM = '<rect x="11.2" y="3.2" width="1.6" height="4.6"/><circle cx="12" cy="2.9" r="1.8"/>'
  + '<rect x="1.3" y="11" width="2.2" height="4.6" rx=".9"/><rect x="20.5" y="11" width="2.2" height="4.6" rx=".9"/>'
  + '<path fill-rule="evenodd" d="M5.5 7.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM8.6 11a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM15.4 11a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM8.5 16.9h7v1.5h-7z"/>';

const KEYS = { shape: SHAPES, color: COLORS, pattern: PATTERNS, emblem: EMBLEMS, metal: METALS };
export const initialOf = name => ([...name.trim()][0] || '').toUpperCase();

export const PARTS = ['shape', 'color', 'pattern', 'emblem', 'metal'];

const pick = obj => { const keys = Object.keys(obj); return keys[Math.floor(Math.random() * keys.length)]; };

export function parseCrest(text) {
  const parts = typeof text === 'string' ? text.split('.') : [];
  const crest = {};
  PARTS.forEach((part, i) => { crest[part] = KEYS[part][parts[i]] ? parts[i] : Object.keys(KEYS[part])[0]; });
  return crest;
}

export const crestString = crest => PARTS.map(part => crest[part]).join('.');

export function randomCrest() {
  return { shape: pick(SHAPES), color: pick(COLORS), pattern: pick(PATTERNS), emblem: 'letter', metal: pick(METALS) };
}

// A stable crest for players who never picked one (older clients): a round badge with
// their initial, in a color taken from their id, much like the old circle avatars.
export function defaultCrest(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const colors = Object.keys(COLORS).filter(c => c !== 'sable');
  return { shape: 'round', color: colors[hash % colors.length], pattern: 'plain', emblem: 'letter', metal: hash % 2 ? 'gold' : 'silver' };
}

// A bot's crest, worked out from its id so every device draws the same one.
export function botCrest(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const from = obj => { const keys = Object.keys(obj); const k = keys[hash % keys.length]; hash = Math.floor(hash / keys.length); return k; };
  return { shape: from(SHAPES), color: from(COLORS), pattern: from(PATTERNS), emblem: 'bot', metal: from(METALS) };
}

const escape = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// The crest as inline SVG. `letter` is the initial shown by the Letter emblem; `ring`
// draws the lava ring that marks your own seat.
export function crestSvg(crest, { letter = '', ring = false } = {}) {
  const shape = SHAPES[crest.shape];
  const field = COLORS[crest.color].hex;
  const metal = METALS[crest.metal].hex;
  const shade = crest.color === 'sable' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.3)';
  const { cx, cy, s } = shape;
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
    + emblem
    + `<path d="${shape.d}" fill="none" stroke="${metal}" stroke-opacity=".85" stroke-width="1.6" stroke-linejoin="round"/>`
    + '</svg>';
}

// Clip paths (one per shape) and the lava gradient, added once to the page's icon sprite.
export function crestDefs() {
  return '<linearGradient id="lava-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0300B"/><stop offset=".45" stop-color="#FF8A00"/><stop offset="1" stop-color="#FFB23D"/></linearGradient>'
    + Object.entries(SHAPES).map(([key, shape]) => `<clipPath id="crest-${key}"><path d="${shape.d}"/></clipPath>`).join('');
}
