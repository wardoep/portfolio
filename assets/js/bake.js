/* bake.js — turn the content JSON into the HTML that ships.
 *
 * Pure string functions, no filesystem, no DOM. That is the point: the same code
 * runs in scripts/bake-*.mjs on this machine AND in the editor when it publishes
 * from penna.lol, so a save made in a browser produces byte-for-byte the same
 * file a local bake would.
 *
 * If these two ever diverged, the browser and the terminal would write different
 * HTML from identical data, and publish.sh check 16 would fail on whichever ran
 * second — a confusing way to find out. One module, no divergence possible.
 *
 * THE CONTRACT, unchanged since the extraction: applyPanels and applyResume must
 * reproduce the hand-written originals byte for byte. That was proven with an
 * empty `diff`, and it is why odd things are preserved rather than tidied — the
 * authoring comment above the About copy, the mid-sentence line wrap in Contact,
 * and Education having no blank line after its heading where Experience does.
 */

const ico = (id, sm = false) =>
  `<svg class="ico${sm ? ' ico--sm' : ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;

/* ── panels ────────────────────────────────────────────────────────────── */

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

export function applyPanels(html, doc) {
  /* One boolean, baked onto <body> rather than fetched: a whole request for a
     setting would be silly, and an attribute is already right before first
     paint, so cards never flash their subtitle and then lose it. */
  const cardText = doc.home?.cardText ? 'on' : 'off';
  let out = html.replace(/<body(?: data-card-text="(?:on|off)")?>/,
                         `<body data-card-text="${cardText}">`);

  for (const p of doc.panels) {
    const open = `<section class="panel" id="p-${p.id}"`;
    const start = out.indexOf(open);
    if (start < 0) throw new Error(`index.html has no panel p-${p.id}`);
    /* '\n</section>' at column 0. The skills panel nests <section> elements for
       its four groups, so a bare indexOf closes the panel at the first one and
       deletes everything after it — that mistake silently ate three quarters of
       the skills list the first time this was written. */
    const end = out.indexOf('\n</section>', start) + '\n</section>'.length;
    /* No trailing newline: `end` stops just after </section>, so the blank line
       between panels is still in the tail being spliced back on. */
    out = out.slice(0, start) + panelHtml(p) + out.slice(end);
  }
  return out;
}

/* ── the résumé page ───────────────────────────────────────────────────── */

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
  if (s.type === 'prose') return `${h}\n<p>${s.html}</p>`;
  if (s.type === 'deflist') {
    return `${h}\n<dl class="skills">\n` +
      s.items.map((i) => `  <dt>${i.term}</dt>\n  <dd>${i.desc}</dd>`).join('\n') +
      '\n</dl>';
  }
  /* Experience and Projects leave a blank line after the heading; Education
     does not. Carried in the data rather than inferred from the heading text,
     so renaming a section keeps the shape it actually has. */
  const gap = s.spaced ? '\n\n' : '\n';
  return h + gap + s.entries.map(entry).join(gap);
};

export function applyResume(html, doc) {
  const body = [
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

  const start = html.indexOf('<header>');
  const end = html.indexOf('\n</body>');
  if (start < 0 || end < 0) throw new Error('resume.html has no <header> … </body>');
  /* Only the content is generated. The <head>, the inline stylesheet and the
     theme script are left exactly as they are — they are not content, and the
     one page that has to stay plain and printable should not be at the mercy
     of a template. */
  return html.slice(0, start) + body + html.slice(end);
}
