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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const doc = JSON.parse(readFileSync(join(ROOT, 'data/content.json'), 'utf8'));

const ico = (id, sm = false) =>
  `<svg class="ico${sm ? ' ico--sm' : ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;

/* Buttons in a .cta-row. `download` and target=_blank are attributes on the
   anchor; a trailing icon sits inside it, after the label. */
const ctaItem = (b) => {
  const cls = `btn${b.primary ? ' btn--primary' : ''}`;
  const attrs = [
    `href="${b.href}"`,
    b.download ? 'download' : null,
    b.external ? 'rel="noopener noreferrer" target="_blank"' : null,
  ].filter(Boolean).join(' ');
  return `      <a class="${cls}" ${attrs}>${b.label}${b.icon ? ico(b.icon, true) : ''}</a>`;
};

const linkItem = (l) => {
  const attrs = [
    `href="${l.href}"`,
    l.open ? `data-open="${l.open}"` : null,
    l.external ? 'rel="noopener noreferrer" target="_blank"' : null,
  ].filter(Boolean).join(' ');
  const tail = l.external ? ico('i-external', true) : '';
  return `      <li><a ${attrs}>${ico(l.icon)}${l.label}${tail}</a></li>`;
};

function block(b) {
  switch (b.type) {
    case 'lead':  return `    <p class="lead">${b.html}</p>`;
    case 'p':     return `    <p>${b.html}</p>`;
    case 'h3':    return `    <h3>${b.text}</h3>`;
    case 'cta':   return `    <p class="cta-row">\n${b.items.map(ctaItem).join('\n')}\n    </p>`;
    case 'beats': return `    <ul class="beats">\n${b.items.map((i) => `      <li>${i}</li>`).join('\n')}\n    </ul>`;
    case 'links': return `    <ul class="links">\n${b.items.map(linkItem).join('\n')}\n    </ul>`;
    case 'skills':
      return '    <div class="skills">\n' + b.groups.map((g) =>
        `      <section><h3>${g.heading}</h3><ul>` +
        g.items.map((i) => `<li>${i}</li>`).join('') +
        '</ul></section>').join('\n') + '\n    </div>';
    case 'address':
      return `    <button class="address" type="button" data-copy-email>\n` +
             `      <span class="address__value" data-email>${b.email}</span>\n` +
             `      <span class="address__hint" data-copy-text>${b.hint}</span>\n` +
             `    </button>`;
    default:
      throw new Error(`unknown block type: ${b.type}`);
  }
}

function panelHtml(p) {
  const note = p.note ? `    <!--${p.note}-->\n` : '';
  return [
    `<section class="panel" id="p-${p.id}" role="dialog" aria-modal="true" aria-labelledby="h-${p.id}" tabindex="-1" hidden>`,
    `  <div class="panel__bar">`,
    `    <span class="panel__badge" style="--badge-tint:${p.tint}">${ico(p.icon)}</span>`,
    `    <h2 id="h-${p.id}">${p.title}</h2>`,
    `  </div>`,
    `  <div class="panel__body prose">`,
    note + p.body.map(block).join('\n'),
    `  </div>`,
    `  <div class="panel__foot">`,
    `    <button class="panel__back" type="button" data-close>${ico('i-arrow-l')}Back</button>`,
    `  </div>`,
    `</section>`,
  ].join('\n');
}

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
let replaced = 0;

for (const p of doc.panels) {
  const open = `<section class="panel" id="p-${p.id}"`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`index.html has no panel p-${p.id}`);
  /* '\n</section>' at column 0 — the skills panel nests <section> elements for
     its four groups, and a bare indexOf would close the panel at the first one
     and delete everything after it. That mistake silently ate three quarters of
     the skills list the first time this was written. */
  const end = html.indexOf('\n</section>', start) + '\n</section>'.length;
  /* No trailing newline: `end` stops just after </section>, so the blank line
     that separates panels is still in the tail being spliced back on. Adding
     one here grew the file by five lines a run, which a diff caught and an eye
     would not have. */
  html = html.slice(0, start) + panelHtml(p) + html.slice(end);
  replaced++;
}

const current = readFileSync(join(ROOT, 'index.html'), 'utf8');
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
