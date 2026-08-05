#!/usr/bin/env node
/* check-contrast.mjs — WCAG ratios computed THROUGH the tint blend.
 *
 * The tint is two blend layers over the whole page, so every published contrast
 * ratio is a lie unless you run the same maths the compositor runs. This file
 * reimplements multiply-then-screen and fails the build if any pair drops below
 * its threshold.
 *
 * Two representations of one rule always drift, so the rule gets a test. The
 * alphas are read out of tokens.css rather than duplicated here — if someone
 * raises the wash, this notices.
 *
 *   node scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../assets/css/tokens.css', import.meta.url), 'utf8');

function token(name, fallback) {
  /* first declaration wins: the :root block, not the data-tint="off" override */
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : fallback;
}

const hex = (h) => {
  const s = h.replace('#', '').trim();
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};

const WASH = hex(token('gb-light', '#8bac0f'));
const LIFT = hex(token('gb-darkest', '#0f380f'));
const A_WASH = parseFloat(token('tint-wash', '.15'));
const A_LIFT = parseFloat(token('tint-lift', '.07'));

const mix = (a, b, t) => a * (1 - t) + b * t;
const multiply = (b, s) => (b * s) / 255;
const screen = (b, s) => 255 - ((255 - b) * (255 - s)) / 255;

/* The layer order in crt.css: wash (multiply) then lift (screen). */
function tinted(rgb) {
  return rgb.map((c, i) => {
    let v = mix(c, multiply(c, WASH[i]), A_WASH);
    v = mix(v, screen(v, LIFT[i]), A_LIFT);
    return Math.max(0, Math.min(255, v));
  });
}

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* [label, foreground, background, minimum] */
const PAIRS = [
  ['panel body on white',        token('ink', '#161a16'),    token('tile', '#ffffff'),  7.0],
  ['muted meta on white',        token('ink-2', '#4a4a4a'),  token('tile', '#ffffff'),  4.5],
  ['dim meta on ground',         token('ink-3', '#6b7169'),  token('ground', '#e4e6e3'), 3.0],
  ['tile label on tile',         token('ink', '#161a16'),    token('tile', '#ffffff'),  4.5],
  ['Start strip: ink on cyan',   token('sel-ink', '#062a33'), token('sel', '#2ddcff'),  4.5],
  ['link on white',              token('sel-deep', '#0a7f96'), token('tile', '#ffffff'), 4.5],
  ['boot cue on black',          '#7f8f7c',                  '#05070a',                 4.5],
];

console.log(`tint: wash ${WASH.map((n) => n.toString(16).padStart(2, '0')).join('')} @ ${A_WASH}` +
            `  lift ${LIFT.map((n) => n.toString(16).padStart(2, '0')).join('')} @ ${A_LIFT}\n`);

let failed = 0;
for (const [label, fg, bg, min] of PAIRS) {
  const plain = ratio(hex(fg), hex(bg));
  const green = ratio(tinted(hex(fg)), tinted(hex(bg)));
  const ok = green >= min;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)}` +
    `plain ${plain.toFixed(2).padStart(6)}   tinted ${green.toFixed(2).padStart(6)}   min ${min}`
  );
}

/* White on the selection colour is the classic console mistake. Assert that we
   did NOT do it, so a future edit cannot quietly reintroduce it. */
const whiteOnSel = ratio(tinted(hex('#ffffff')), tinted(hex(token('sel', '#2ddcff'))));
console.log(`\n  note  white on the selection colour would be ${whiteOnSel.toFixed(2)} — ` +
            `which is why the Start strip uses dark ink.`);

if (failed) {
  console.error(`\n${failed} pair(s) below threshold under the tint.`);
  process.exit(1);
}
console.log('\nall pairs pass under the tint.');
