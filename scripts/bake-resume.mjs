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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const doc = JSON.parse(readFileSync(join(ROOT, 'data/resume.json'), 'utf8'));

const entry = (e) => {
  const out = ['<div class="entry">', '  <div class="entry__top">',
               `    <span class="entry__title">${e.title}</span>`];
  if (e.when !== undefined) out.push(`    <span class="entry__when">${e.when}</span>`);
  out.push('  </div>');
  if (e.note !== undefined) out.push(`  <p class="entry__note">${e.note}</p>`);
  if (e.bullets?.length) {
    out.push('  <ul>');
    for (const b of e.bullets) out.push(`    <li>${b}</li>`);
    out.push('  </ul>');
  }
  if (e.where !== undefined) out.push(`  <p class="entry__where">${e.where}</p>`);
  out.push('</div>');
  return out.join('\n');
};

const section = (s) => {
  const h = `<h2>${s.heading}</h2>`;
  if (s.type === 'prose')   return `${h}\n<p>${s.html}</p>`;
  if (s.type === 'deflist') {
    return `${h}\n<dl class="skills">\n` +
      s.items.map((i) => `  <dt>${i.term}</dt>\n  <dd>${i.desc}</dd>`).join('\n') +
      '\n</dl>';
  }
  /* Experience and Projects put a blank line between the heading and the first
     entry and between entries; Education does not. Driven by the data rather
     than the heading name so a renamed section keeps its shape. */
  const gap = s.spaced ? '\n\n' : '\n';
  return h + gap + s.entries.map(entry).join(gap);
};

const bodyHtml = [
  '<header>',
  `  <h1>${doc.name}</h1>`,
  `  <p class="role">${doc.role}</p>`,
  '  <ul class="contact">',
  ...doc.contact.map((c) => `    <li><a href="${c.href}">${c.label}</a></li>`),
  '  </ul>',
  '</header>',
  '',
  doc.sections.map(section).join('\n\n'),
  '',
  '<p class="noprint" style="margin-top:30px;color:#4a4f52;font-size:14px">',
  `  ${doc.footer.text}`,
  `  <a href="${doc.footer.href}">${doc.footer.label}</a>`,
  '</p>',
  '',            /* the blank line the original leaves before </body> */
].join('\n');

const current = readFileSync(join(ROOT, 'resume.html'), 'utf8');
const start = current.indexOf('<header>');
const end = current.indexOf('\n</body>');
if (start < 0 || end < 0) throw new Error('resume.html has no <header> … </body>');

const next = current.slice(0, start) + bodyHtml + current.slice(end);

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
