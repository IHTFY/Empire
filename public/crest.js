// Crests: each player's avatar is a small coat of arms built from five choices.
// A crest is stored as one short string, "shape.colour.pattern.emblem.metal", e.g.
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
  pennon: { label: 'Pennon', d: 'M4 9h40l-8 15 8 15H4z', cx: 19.5, cy: 24, s: 0.94 }
};

export const COLOURS = {
  crimson: { label: 'Crimson', hex: '#B8283B' },
  rust: { label: 'Rust', hex: '#C0662B' },
  ochre: { label: 'Ochre', hex: '#8F7A14' },
  green: { label: 'Green', hex: '#2F7D3A' },
  teal: { label: 'Teal', hex: '#0E8A74' },
  azure: { label: 'Azure', hex: '#2E7FB8' },
  blue: { label: 'Blue', hex: '#3F54CF' },
  violet: { label: 'Violet', hex: '#6D4FC2' },
  tyrian: { label: 'Tyrian', hex: '#8E2A62' },
  sable: { label: 'Sable', hex: '#23243A' }
};

export const METALS = {
  gold: { label: 'Gold', hex: '#F2B84B' },
  silver: { label: 'Silver', hex: '#E4E6EF' }
};

// Divisions of the field, drawn as a shade of the field colour.
export const PATTERNS = {
  plain: { label: 'Plain', d: '' },
  pale: { label: 'Per pale', d: 'M24 0h24v48H24z' },
  bend: { label: 'Per bend', d: 'M0 0h48v48z' },
  chief: { label: 'Chief', d: 'M0 0h48v15H0z' },
  chevron: { label: 'Chevron', d: 'M0 48L24 22l24 26z' },
  quarterly: { label: 'Quarterly', d: 'M0 0h24v24H0zM24 24h24v24H24z' },
  cross: { label: 'Cross', d: 'M20 0h8v48h-8zM0 20h48v8H0z' },
  saltire: { label: 'Saltire', d: 'M0 5.7L5.7 0 48 42.3 42.3 48zM42.3 0L48 5.7 5.7 48 0 42.3z' }
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
  cross: { label: 'Cross', svg: '<path d="M9 2h6l-1.5 8.5L22 9v6l-8.5-1.5L15 22H9l1.5-8.5L2 15V9l8.5 1.5z"/>' }
};

const KEYS = { shape: SHAPES, colour: COLOURS, pattern: PATTERNS, emblem: EMBLEMS, metal: METALS };
export const PARTS = ['shape', 'colour', 'pattern', 'emblem', 'metal'];

const pick = obj => { const keys = Object.keys(obj); return keys[Math.floor(Math.random() * keys.length)]; };

export function parseCrest(text) {
  const parts = typeof text === 'string' ? text.split('.') : [];
  const crest = {};
  PARTS.forEach((part, i) => { crest[part] = KEYS[part][parts[i]] ? parts[i] : Object.keys(KEYS[part])[0]; });
  return crest;
}

export const crestString = crest => PARTS.map(part => crest[part]).join('.');

export function randomCrest() {
  return { shape: pick(SHAPES), colour: pick(COLOURS), pattern: pick(PATTERNS), emblem: 'letter', metal: pick(METALS) };
}

// A stable crest for players who never picked one (older clients): a round badge with
// their initial, in a colour taken from their id, much like the old circle avatars.
export function defaultCrest(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const colours = Object.keys(COLOURS).filter(c => c !== 'sable');
  return { shape: 'round', colour: colours[hash % colours.length], pattern: 'plain', emblem: 'letter', metal: hash % 2 ? 'gold' : 'silver' };
}

const escape = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// The crest as inline SVG. `letter` is the initial shown by the Letter emblem; `ring`
// draws the lava ring that marks your own seat.
export function crestSvg(crest, { letter = '', ring = false } = {}) {
  const shape = SHAPES[crest.shape];
  const field = COLOURS[crest.colour].hex;
  const metal = METALS[crest.metal].hex;
  const shade = crest.colour === 'sable' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.3)';
  const { cx, cy, s } = shape;
  let emblem;
  if (crest.emblem === 'letter') {
    emblem = letter
      ? `<text x="${cx}" y="${round(cy + 9.4 * s)}" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-style="italic" font-weight="800" font-size="${round(27 * s)}" fill="${metal}">${escape(letter)}</text>`
      : '';
  } else {
    emblem = `<g fill="${metal}" color="${metal}" transform="translate(${round(cx - 12 * s)} ${round(cy - 12 * s)}) scale(${s})">${EMBLEMS[crest.emblem].svg}</g>`;
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
