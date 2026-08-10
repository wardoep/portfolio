#!/usr/bin/env node
/* bake-panels.mjs — write the panel HTML in index.html from data/content.json.
 *
 *   node scripts/bake-panels.mjs           rewrite index.html
 *   node scripts/bake-panels.mjs --check   exit 1 if it would change anything
 *
 * WHY THIS EXISTS. The panels used to be hand-written HTML, deliberately: real
 * content in the document means a scraper, a reader mode and a failed script all
 * still find the words. That property is worth keeping. But the copy also has to
 * be editable from the admin panel, and an editor cannot safely rewrite
 * hand-written markup.
 *
 * So the JSON is the source and the HTML is a build artifact — generated on this
 * machine, committed, and gated by publish.sh check 16 so the two cannot drift.
 * Nothing is generated on GitHub: publish.sh can still assert what production
 * serves by reading the repo.
 *
 * THE CONTRACT. This must be the exact inverse of the extraction that created
 * content.json. It was proven by running it against the hand-written original
 * and requiring `git diff index.html` to be empty — not "looks the same", empty.
 * That is why odd things are preserved rather than normalised: the authoring
 * comment above the About copy, and the mid-sentence line wrap in the Contact
 * paragraph. If this ever stops round-tripping, the diff is the bug report.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyPanels } from '../assets/js/bake.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const doc = JSON.parse(readFileSync(join(ROOT, 'data/content.json'), 'utf8'));

/* The templating itself lives in assets/js/bake.js, because the editor has to
   run exactly the same code when it publishes from penna.lol. Two copies would
   mean a browser save and a local bake could write different bytes from the
   same data, and check 16 would fail on whichever ran second. */
const current = readFileSync(join(ROOT, 'index.html'), 'utf8');
const html = applyPanels(current, doc);
const replaced = doc.panels.length;

if (CHECK) {
  if (html !== current) {
    console.error('index.html does not match data/content.json — run: node scripts/bake-panels.mjs');
    process.exit(1);
  }
  console.log(`index.html matches content.json (${replaced} panels)`);
  process.exit(0);
}
if (html === current) {
  console.log(`index.html already current (${replaced} panels)`);
} else {
  writeFileSync(join(ROOT, 'index.html'), html);
  console.log(`index.html rewritten from content.json (${replaced} panels)`);
}
