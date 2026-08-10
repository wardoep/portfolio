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

/* ── keeping markup out of the markup ──────────────────────────────────────
 *
 * Every field below used to be interpolated raw. The same functions write the
 * committed index.html AND run in the editor through innerHTML, and rules.js
 * never looked at markup — so `<img src=x onerror=…>` typed into a panel became
 * a script tag on the homepage, and check 16 then certified the result as
 * correct, because the HTML faithfully matched the JSON it came from. The gate
 * would have signed the payload.
 *
 * NOT a blanket escape. The copy legitimately contains <strong> and one <a>,
 * and & is already stored as &amp; — escaping everything would print the tags
 * as text and turn every &amp; into &amp;amp; on the next bake. So: an
 * allowlist of the tags this site actually uses, and escaping for the rest.
 *
 * The allowlist is deliberately short. Adding to it is a decision about what a
 * compromised or careless edit is allowed to put on the page, not a formatting
 * convenience. */
const VOID = new Set(['br']);
const TAGS = {
  a: ['href'], strong: [], em: [], b: [], i: [], code: [], br: [], abbr: ['title'],
};

/* Escape for text. The lookahead leaves an existing entity alone, so a stored
   &amp; survives a bake unchanged instead of growing an &amp; every time. */
export const escText = (s) => String(s ?? '')
  .replace(/&(?!#?[a-zA-Z0-9]+;)/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

/* A URL safe to put in an href that will be committed and served.
 *
 * util.js has safeUrl() for the same job at runtime, but it deliberately
 * rejects anything relative — with no base, `new URL('resume.html')` throws —
 * and half the links here are relative or routes. So this is its sibling, and
 * the pair should move together: absolute http(s) and mailto, plus relative
 * paths and #routes. Everything else, notably javascript: and data:, is
 * dropped rather than corrected, because there is no safe repair. */
export function bakeHref(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  /* `//evil.com` is scheme-relative and navigates straight off-site, so the
     leading-slash branch has to insist on exactly one. */
  if (/^(?:#|\.{1,2}\/|\/(?!\/))/.test(s)) return s;         /* #route, ./path, /path */
  if (/^[a-zA-Z][\w+.-]*:/.test(s)) {                         /* has a scheme */
    return /^(?:https?|mailto):/i.test(s) ? s : null;
  }
  if (/^[\w.-]+(?:\/|$)/.test(s)) return s;                   /* resume.html, assets/x */
  return null;
}

/* Keep the allowed tags, escape everything else. Small on purpose: this site's
   copy uses <strong> and a single <a>, so a parser that handles those exactly
   and refuses to guess at the rest is the right size for the job. */
export function sanitize(input) {
  const src = String(input ?? '');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { out += escText(src.slice(i)); break; }
    out += escText(src.slice(i, lt));

    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(src.slice(lt));
    if (!m) { out += '&lt;'; i = lt + 1; continue; }          /* a stray < is text */

    const [raw, closing, nameRaw, attrRaw] = m;
    const name = nameRaw.toLowerCase();
    if (!(name in TAGS)) { out += escText(raw); i = lt + raw.length; continue; }

    if (closing) {
      out += VOID.has(name) ? '' : `</${name}>`;
    } else {
      let attrs = '';
      for (const a of attrRaw.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g)) {
        const key = (a[1] || a[3]).toLowerCase();
        const val = a[2] !== undefined ? a[2] : a[4];
        if (!TAGS[name].includes(key)) continue;              /* drops every on* handler */
        if (key === 'href') {
          const href = bakeHref(val);
          if (href === null) continue;
          attrs += ` href="${escAttr(href)}"`;
        } else {
          attrs += ` ${key}="${escAttr(val)}"`;
        }
      }
      out += VOID.has(name) ? `<${name}>` : `<${name}${attrs}>`;
    }
    i = lt + raw.length;
  }
  return out;
}

const ico = (id, sm = false) =>
  `<svg class="ico${sm ? ' ico--sm' : ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;

/* ── panels ────────────────────────────────────────────────────────────── */

const ctaItem = (b) => {
  const cls = `btn${b.primary ? ' btn--primary' : ''}`;
  const attrs = [
    `href="${escAttr(bakeHref(b.href) ?? '#')}"`,
    b.download ? 'download' : null,
    b.external ? 'rel="noopener noreferrer" target="_blank"' : null,
  ].filter(Boolean).join(' ');
  return `      <a class="${cls}" ${attrs}>${escText(b.label)}${b.icon ? ico(b.icon, true) : ''}</a>`;
};

const linkItem = (l) => {
  const attrs = [
    `href="${escAttr(bakeHref(l.href) ?? '#')}"`,
    l.open ? `data-open="${escAttr(l.open)}"` : null,
    l.external ? 'rel="noopener noreferrer" target="_blank"' : null,
  ].filter(Boolean).join(' ');
  const tail = l.external ? ico('i-external', true) : '';
  return `      <li><a ${attrs}>${ico(l.icon)}${escText(l.label)}${tail}</a></li>`;
};

export function blockHtml(b) {
  switch (b.type) {
    case 'lead':  return `    <p class="lead">${sanitize(b.html)}</p>`;
    case 'p':     return `    <p>${sanitize(b.html)}</p>`;
    case 'h3':    return `    <h3>${escText(b.text)}</h3>`;
    case 'cta':   return `    <p class="cta-row">\n${b.items.map(ctaItem).join('\n')}\n    </p>`;
    case 'beats': return `    <ul class="beats">\n${b.items.map((i) => `      <li>${sanitize(i)}</li>`).join('\n')}\n    </ul>`;
    case 'links': return `    <ul class="links">\n${b.items.map(linkItem).join('\n')}\n    </ul>`;
    case 'skills':
      return '    <div class="skills">\n' + b.groups.map((g) =>
        `      <section><h3>${escText(g.heading)}</h3><ul>` +
        g.items.map((i) => `<li>${sanitize(i)}</li>`).join('') +
        '</ul></section>').join('\n') + '\n    </div>';
    case 'address':
      return `    <button class="address" type="button" data-copy-email>\n` +
             `      <span class="address__value" data-email>${escText(b.email)}</span>\n` +
             `      <span class="address__hint" data-copy-text>${escText(b.hint)}</span>\n` +
             `    </button>`;
    default:
      throw new Error(`unknown block type: ${b.type}`);
  }
}

/* The inner HTML of a panel body, on its own. The editor re-renders a panel in
   place after every edit using exactly this, so what is on screen while you type
   is the markup that will ship — not a preview of it. */
export function panelBodyHtml(p) {
  /* A note ending in --> would close the comment early and everything after it
     would render as markup. Neutralised rather than dropped, so the authoring
     notes the contract preserves keep working. */
  const note = p.note ? `    <!--${String(p.note).replace(/--+>/g, '--&gt;')}-->\n` : '';
  return note + p.body.map(blockHtml).join('\n');
}

function panelHtml(p) {
  return [
    `<section class="panel" id="p-${p.id}" role="dialog" aria-modal="true" aria-labelledby="h-${p.id}" tabindex="-1" hidden>`,
    `  <div class="panel__bar">`,
    `    <span class="panel__badge" style="--badge-tint:${/^(?:var\(--[\w-]+\)|#[0-9a-fA-F]{3,8})$/.test(p.tint || '') ? p.tint : 'transparent'}">${ico(p.icon)}</span>`,
    `    <h2 id="h-${p.id}">${escText(p.title)}</h2>`,
    `  </div>`,
    `  <div class="panel__body prose">`,
    panelBodyHtml(p),
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
               `    <span class="entry__title">${escText(e.title)}</span>`];
  if (e.when !== undefined) out.push(`    <span class="entry__when">${sanitize(e.when)}</span>`);
  out.push('  </div>');
  if (e.note !== undefined) out.push(`  <p class="entry__note">${sanitize(e.note)}</p>`);
  if (e.bullets?.length) {
    out.push('  <ul>');
    for (const b of e.bullets) out.push(`    <li>${sanitize(b)}</li>`);
    out.push('  </ul>');
  }
  if (e.where !== undefined) out.push(`  <p class="entry__where">${sanitize(e.where)}</p>`);
  out.push('</div>');
  return out.join('\n');
};

const section = (s) => {
  const h = `<h2>${escText(s.heading)}</h2>`;
  if (s.type === 'prose') return `${h}\n<p>${sanitize(s.html)}</p>`;
  if (s.type === 'deflist') {
    return `${h}\n<dl class="skills">\n` +
      s.items.map((i) => `  <dt>${escText(i.term)}</dt>\n  <dd>${sanitize(i.desc)}</dd>`).join('\n') +
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
    `  <h1>${escText(doc.name)}</h1>`,
    `  <p class="role">${escText(doc.role)}</p>`,
    '  <ul class="contact">',
    ...doc.contact.map((c) => `    <li><a href="${escAttr(bakeHref(c.href) ?? '#')}">${escText(c.label)}</a></li>`),
    '  </ul>',
    '</header>',
    '',
    doc.sections.map(section).join('\n\n'),
    '',
    '<p class="noprint" style="margin-top:30px;color:#4a4f52;font-size:14px">',
    `  ${escText(doc.footer.text)}`,
    `  <a href="${escAttr(bakeHref(doc.footer.href) ?? '#')}">${escText(doc.footer.label)}</a>`,
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
