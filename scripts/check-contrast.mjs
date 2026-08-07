#!/usr/bin/env node
/* check-contrast.mjs — WCAG ratios for every text/ground pair, in BOTH themes.
 *
 * The green tint is gone, so the blend maths that used to live here went with
 * it. What replaced it is harder to eyeball, not easier: dark mode doubles the
 * surface area, and the failure it invites is specific — a token that should
 * INVERT between themes instead of merely darkening. `--sel-deep` is the link
 * and switch colour; a dark teal on a dark ground looks plausible and measures
 * about 1.8. That is exactly the kind of thing this file exists to catch.
 *
 * Values are read out of tokens.css rather than duplicated, so editing a colour
 * there is checked here automatically.
 *
 *   node scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../assets/css/tokens.css', import.meta.url), 'utf8');

/* :root {...} is light; :root[data-theme='dark'] {...} is dark. */
function block(selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`no ${selector} block in tokens.css`);
  return css.slice(i, css.indexOf('}', i));
}
const LIGHT = block(':root {');
const DARK = block(":root[data-theme='dark']");

function token(name, scope) {
  const m = scope.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}
/* dark inherits anything it does not restate */
const get = (name, theme) => (theme === 'dark' ? token(name, DARK) : null) ?? token(name, LIGHT);

const hex = (h) => {
  const s = String(h).replace('#', '').trim();
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* The active row is a gradient; check against its lighter stop, which is the
   worse case for dark text and the better case for light — so take both ends. */
const rowStops = (theme) => {
  const g = get('row-active', theme) || '';
  return [...g.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
};

/* [label, fg token or literal, bg token or literal, minimum] */
const PAIRS = [
  ['body text on card',        'ink',      'tile',       7.0],
  ['muted text on card',       'ink-2',    'tile',       4.5],
  ['dim text on ground',       'ink-3',    'ground',     3.0],
  ['card label on card',       'ink',      'tile-2',     4.5],
  ['link on card',             'sel-deep', 'tile',       4.5],
  ['link on ground',           'sel-deep', 'ground',     4.5],
  ['ink on the accent pill',   'sel-ink',  'sel',        4.5],
  ['body text on ground',      'ink',      'ground',     7.0],
  ['muted text on ground',     'ink-2',    'ground',     4.5],
  /* the start screen is its own world — white on black, not the site palette */
  ['boot body on black',       '#e9e9e9',  '#000000',    7.0],
  ['boot "also" on black',     '#cfcfcf',  '#000000',    4.5],

  /* Each face carries its OWN ink, because the three channels are told apart by
     polarity: two are inked and one is left as paper, and that flips wholesale
     between themes. Pairing a hardcoded white against every face — which is what
     this did before — passes in one theme and fails in the other. */
  ['ink on PROJECTS face',     'card-projects-ink', 'card-projects', 4.5],
  ['ink on BUILDS face',       'card-builds-ink',   'card-builds',   4.5],
  ['ink on RESUME face',       'card-resume-ink',   'card-resume',   4.5],

  /* Every face is the same value, so one pair covers all three.
     The threshold is 1.4 rather than 3.0 because what makes a card read as a
     card is the 3px rule drawn around it, not a luminance step — so the RULE is
     what gets gated hard, and lowering the face pair without raising the rule
     pair would be moving a goalpost rather than measuring the design.

     The face is PAPER now, and the separation was bought by darkening the
     GROUND to a mid grey rather than by relaxing this number: paper on the old
     near-white ground measured 1.07 and would have needed the threshold moved,
     which is the tell that the change was wrong. It measures 1.50 in light and
     1.64 in dark against an unchanged 1.4, and every text-on-ground pair above
     kept its headroom (ink lands at 12.19, the dimmest grey at 3.87). */
  ['face vs ground',           'card-projects', 'ground',      1.4],
  ['tile rule vs ground',      'card-rule',     'ground',      7.0],
  ['tile rule vs its own face', 'card-rule',    'card-projects', 4.5],
  ['panel rule vs ground',     'tile-edge',     'ground',      3.0],
];

let failed = 0;
for (const theme of ['light', 'dark']) {
  console.log(`\n${theme.toUpperCase()}`);
  for (const [label, fg, bg, min] of PAIRS) {
    const f = fg.startsWith('#') ? fg : get(fg, theme);
    const b = bg.startsWith('#') ? bg : get(bg, theme);
    const r = ratio(f, b);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(24)}` +
                `${String(f).padEnd(9)} on ${String(b).padEnd(9)} ` +
                `${r.toFixed(2).padStart(6)}   min ${min}`);
  }
  /* row text against both ends of the active gradient */
  for (const stop of rowStops(theme)) {
    for (const [what, tok, min] of [['name', 'ink', 4.5], ['blurb', 'ink-2', 4.5]]) {
      const r = ratio(get(tok, theme), stop);
      const ok = r >= min;
      if (!ok) failed++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${('row ' + what + ' on active').padEnd(24)}` +
                  `${get(tok, theme).padEnd(9)} on ${stop.padEnd(9)} ` +
                  `${r.toFixed(2).padStart(6)}   min ${min}`);
    }
  }
}

/* Assert the mistakes that are invisible by eye. */
console.log('\nGUARDS');
/* The three faces are deliberately identical: the icon and the name do the
   distinguishing. An odd one out is what the previous look was rejected for, so
   a face drifting away from the others is a design regression, not a taste
   call — and it is the kind of thing a diff hides in plain sight. */
for (const theme of ['light', 'dark']) {
  const faces = ['card-projects', 'card-builds', 'card-resume'].map((t) => get(t, theme));
  if (new Set(faces).size !== 1) {
    console.log(`  FAIL  the three faces have drifted apart in ${theme} — ${faces.join(', ')}`);
    failed++;
  } else {
    console.log(`  ok    all three faces are ${faces[0]} in ${theme}`);
  }
}
/* The background canvas draws in --star-ink. If a theme forgets to flip it, the
   field is black-on-black or white-on-white — a background that is simply not
   there, and one that no screenshot diff would flag because "nothing visible"
   is what an empty canvas looks like anyway. 1.4 is the same bar the card face
   clears: enough to see, not so much it competes with text. */
for (const theme of ['light', 'dark']) {
  const r = ratio(get('star-ink', theme), get('ground', theme));
  if (r < 1.4) {
    console.log(`  FAIL  --star-ink is invisible on the ${theme} ground (${r.toFixed(2)}) — ` +
                `it must invert between themes.`);
    failed++;
  } else {
    console.log(`  ok    the pixel field reads at ${r.toFixed(2)} on the ${theme} ground`);
  }
}

/* --ar and --ar-inv are hand-maintained reciprocals, kept apart so the grid's
   calc() never divides by a variable. Editing one and forgetting the other
   yields tiles that are subtly the wrong shape rather than an error. */
{
  const ar = parseFloat(token('ar', LIGHT));
  const inv = parseFloat(token('ar-inv', LIGHT));
  if (Math.abs(ar * inv - 1) > 0.005) {
    console.log(`  FAIL  --ar (${ar}) and --ar-inv (${inv}) are not reciprocal — ` +
                `product is ${(ar * inv).toFixed(4)}`);
    failed++;
  } else {
    console.log(`  ok    --ar and --ar-inv are reciprocal (${ar} x ${inv})`);
  }
}

for (const theme of ['light', 'dark']) {
  const white = ratio('#ffffff', get('sel', theme));
  console.log(`  note  white on --sel would be ${white.toFixed(2)} in ${theme} — ` +
              `which is why --sel-ink is dark.`);
  const deepVsGround = ratio(get('sel-deep', theme), get('ground', theme));
  if (deepVsGround < 4.5) {
    console.log(`  FAIL  --sel-deep does not read on the ${theme} ground ` +
                `(${deepVsGround.toFixed(2)}) — it must invert between themes, not darken.`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} pair(s) below threshold.`);
  process.exit(1);
}
console.log('\nall pairs pass in both themes.');
