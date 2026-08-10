#!/usr/bin/env node
/* bake-resume.mjs — write resume.html from data/resume.json.
 *
 *   node scripts/bake-resume.mjs           rewrite resume.html
 *   node scripts/bake-resume.mjs --check   exit 1 if it would change anything
 *
 * Same contract as bake-panels.mjs: the JSON is the source, the HTML is a
 * committed artifact, and this must be the exact inverse of the extraction that
 * produced the JSON — proven by requiring `git diff resume.html` to be EMPTY
 * against the hand-written original.
 *
 * Only the CONTENT between <header> and </body> is generated. The <head>, the
 * inline stylesheet and the theme script are left exactly as they are: they are
 * not content, nobody is going to edit them from an admin panel, and
 * regenerating them would put the one page that must stay plain and printable
 * at the mercy of a template.
 *
 * resume.html is also the source of resume.pdf, and publish.sh check 12 pins
 * the PDF to a hash of this file. So changing the JSON means the PDF is stale
 * until `node scripts/make-resume-pdf.mjs` runs. deploy.sh does that; the build
 * refuses to ship a mismatch either way.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyResume } from '../assets/js/bake.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const doc = JSON.parse(readFileSync(join(ROOT, 'data/resume.json'), 'utf8'));

/* Templating shared with the editor — see the note in bake-panels.mjs. */
const current = readFileSync(join(ROOT, 'resume.html'), 'utf8');
const next = applyResume(current, doc);

if (CHECK) {
  if (next !== current) {
    console.error('resume.html does not match data/resume.json — run: node scripts/bake-resume.mjs');
    process.exit(1);
  }
  console.log(`resume.html matches resume.json (${doc.sections.length} sections)`);
  process.exit(0);
}
if (next === current) {
  console.log(`resume.html already current (${doc.sections.length} sections)`);
} else {
  writeFileSync(join(ROOT, 'resume.html'), next);
  console.log(`resume.html rewritten from resume.json (${doc.sections.length} sections)`);
  console.log('resume.pdf is now stale — run: node scripts/make-resume-pdf.mjs');
}
