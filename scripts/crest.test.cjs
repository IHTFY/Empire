const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const load = () => import('../public/crest.js');
const relativeLuminance = hex => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const contrast = (a, b) => { const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

test('every crest key, offered or retired, satisfies the database rule', async () => {
  const crest = await load();
  const rules = readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8');
  const rule = new RegExp(rules.match(/"crest":.*?matches\(\/(.+?)\/\)/)[1].replaceAll('\\\\', '\\'));
  const base = { shape: 'heater', color: 'crimson', pattern: 'plain', emblem: 'lion', metal: 'gold', trim: 'inset' };
  const options = { shape: crest.SHAPES, color: crest.COLORS, pattern: crest.PATTERNS, emblem: crest.EMBLEMS, metal: crest.METALS, trim: crest.TRIMS, ink: crest.INKS };
  for (const [part, keys] of Object.entries(options)) {
    for (const key of Object.keys(keys)) assert.match(crest.crestString({ ...base, [part]: key }), rule, `${part} ${key}`);
  }
});

test('saved crests with retired marks still parse unchanged', async () => {
  const { parseCrest, crestString } = await load();
  for (const saved of ['banner.ochre.plain.legion.bronze.inset', 'tablet.lapis.chief.lion.platinum.double', 'heater.sea.plain.oak.copper.riveted']) {
    assert.equal(crestString(parseCrest(saved)), saved);
  }
});

test('a saved crest naming an inherited key, such as constructor, falls back and still draws', async () => {
  const { parseCrest, crestString, crestSvg } = await load();
  const crest = parseCrest('constructor.toString.constructor.constructor.constructor.constructor');
  assert.equal(crestString(crest), 'hoplon.crimson.plain.letter.gold.inset');
  assert.match(crestSvg(crest), /^<svg/);
});

test('players are offered only current colors, metals and emblems', async () => {
  const { COLOR_CHOICES, METAL_CHOICES, EMBLEM_CHOICES, randomCrest, botCrest } = await load();
  assert.deepEqual(Object.keys(METAL_CHOICES), ['gold', 'silver', 'obsidian']);
  assert(!EMBLEM_CHOICES.legion && EMBLEM_CHOICES.botonny && EMBLEM_CHOICES.maltese);
  for (let i = 0; i < 50; i++) {
    const crest = randomCrest();
    assert(COLOR_CHOICES[crest.color] && METAL_CHOICES[crest.metal]);
    const bot = botCrest(`bot${i}`);
    assert(COLOR_CHOICES[bot.color] && METAL_CHOICES[bot.metal]);
  }
});

test('emblems are inked black or white with at least 3:1 contrast on every color', async () => {
  const { COLORS, inkFor, crestSvg } = await load();
  for (const [key, color] of Object.entries(COLORS)) assert(contrast(inkFor(color.hex), color.hex) >= 3, `${key} ink contrast`);
  assert.equal(inkFor(COLORS.yellow.hex), '#15161C');
  assert.equal(inkFor(COLORS.sable.hex), '#F5F3EE');
  const svg = crestSvg({ shape: 'heater', color: 'midnight', pattern: 'plain', emblem: 'griffin', metal: 'gold', trim: 'inset' });
  assert.match(svg, /<g fill="#F5F3EE" color="#F5F3EE" transform/);
});

test('a chosen emblem color is saved, and auto leaves older crest strings unchanged', async () => {
  const { parseCrest, crestString } = await load();
  assert.equal(crestString(parseCrest('heater.crimson.plain.lion.gold.inset')), 'heater.crimson.plain.lion.gold.inset');
  assert.equal(parseCrest('heater.crimson.plain.lion.gold.inset').ink, 'auto');
  assert.equal(crestString(parseCrest('heater.crimson.plain.lion.gold.inset.yellow')), 'heater.crimson.plain.lion.gold.inset.yellow');
  assert.equal(parseCrest('heater.crimson.plain.lion.gold.inset.bogus').ink, 'auto');
});

test('a chosen emblem color is drawn, outlined in black or white only when it lacks 3:1 contrast', async () => {
  const { COLORS, crestSvg } = await load();
  const crest = { shape: 'heater', color: 'midnight', pattern: 'plain', emblem: 'griffin', metal: 'gold', trim: 'inset' };
  const yellow = crestSvg({ ...crest, ink: 'yellow' });
  assert.match(yellow, new RegExp(`<g fill="${COLORS.yellow.hex}" color="${COLORS.yellow.hex}" transform`));
  assert.doesNotMatch(yellow, /crest-outline/);
  const blue = crestSvg({ ...crest, ink: 'blue' });
  assert.match(blue, /<g fill="#F5F3EE" color="#F5F3EE" filter="url\(#crest-outline\)" transform[^]*<g fill="#2556C8"/);
  for (const [field] of Object.entries(COLORS)) {
    for (const [ink, { hex }] of Object.entries(COLORS)) {
      const svg = crestSvg({ ...crest, color: field, ink }, { letter: 'A' });
      const outline = svg.match(/fill="(#\w+)" color="#\w+" filter/)?.[1];
      if (contrast(hex, COLORS[field].hex) >= 3) assert.equal(outline, undefined, `${ink} on ${field}`);
      else assert(contrast(outline, COLORS[field].hex) >= 3, `${ink} on ${field} outline`);
    }
  }
  assert.match(crestSvg({ ...crest, emblem: 'letter', color: 'yellow', ink: 'amber' }, { letter: 'A' }), /fill="#15161C" filter="url\(#crest-outline\)">A<\/text>.*fill="#F6B91A">A</);
});
