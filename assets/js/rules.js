/* rules.js — the publish rules, in a form a browser can run.
 *
 * A MIRROR, NOT THE AUTHORITY. publish.sh is the authority; these exist so the
 * editor can refuse a save that would fail it, at the moment you type it, rather
 * than letting you publish and find out from a red build.
 *
 * Only the rules that can be checked from text are here. The ones that need the
 * filesystem or a browser — icons existing in the sprite, contrast ratios, the
 * PDF matching its source, projects.json being in sync with GitHub — stay in
 * publish.sh alone, which is why a local ./deploy.sh is still the last word.
 *
 * Each rule names the publish.sh check it mirrors, so when one moves the other
 * is easy to find. If they ever disagree, publish.sh wins by definition: it is
 * the thing standing between the repo and the live site.
 */

/* check 6 — details that must never reach a public, permanently-archived URL.
   Split the same way publish.sh splits them, so this file does not match itself
   when check 6 greps the tree.

   Exported because the test needs to prove these fire, and the only safe way to
   do that is to rebuild a matching string FROM the pattern at runtime. Every
   file on this branch — tests included — is served from penna.lol, so a probe
   typed out as a literal would publish the very details this list exists to
   keep off the site. */
export const PRIVATE = [
  [/721[-\s]?797[1]/, 'a phone number'],
  [/\byaho[o]\.com\b/i, 'the old email address'],
  [/\bSt\.? Jame[s]\b/i, 'a home town'],
];

/* check 14 — copy that has to be maintained by hand every time a repo is pushed.
   NOTE the wording of the message this produces, and of this comment: check 14
   scans string literals in assets/js/*.js, so a rule that named the phrase it
   hunts for would flag itself. publish.sh solves the same problem by splitting
   its literals; here it is simpler to say it a different way. */
const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|' +
            'thirteen|fourteen|fifteen|twenty|dozen|several|many|numerous|handful)';
const THING = '(?:labs?|builds?|projects?|repos?|repositories|entries|runbooks?|more)';
const COUNTS = new RegExp(`\\b${NUM}\\s+(?:\\w+\\s+){0,4}${THING}\\b`, 'i');
const BY_HAND = /\b(?:by hand|from scratch|hand-(?:built|written|made|coded))\b/i;

/* check 13 — a forward-looking date that will quietly go past. */
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
const FUTURE_DATE = new RegExp(
  `(scheduled|sitting|upcoming|due|expected|starting)\\b[^.<]{0,60}?\\b(${MONTHS})\\s+(\\d{4})`, 'i');

const BLURB_MAX = 120;   /* scripts/merge_projects.py */

/* Walk any nested structure and hand back every string with a readable path, so
   a complaint can say WHERE rather than just what. */
function* strings(node, path = '') {
  if (typeof node === 'string') { yield [path, node]; return; }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* strings(node[i], `${path}[${i}]`);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('_')) continue;              /* authoring notes */
      yield* strings(v, path ? `${path}.${k}` : k);
    }
  }
}

/* Returns [] when everything is fine. Each problem is {where, why, quote}. */
export function check(files) {
  const out = [];
  const add = (where, why, quote) => out.push({ where, why, quote });

  for (const [file, doc] of Object.entries(files)) {
    if (!doc) continue;
    for (const [path, s] of strings(doc)) {
      /* The gh object is GitHub's own text, replaced wholesale on every sync.
         Flagging a repo description would be complaining about something the
         editor cannot fix. */
      if (path.includes('.gh.') || path.endsWith('.gh')) continue;

      for (const [re, what] of PRIVATE) {
        if (re.test(s)) add(`${file} ${path}`, `contains ${what}`, s.slice(0, 70));
      }
      const c = s.match(COUNTS);
      if (c) add(`${file} ${path}`, 'counts the work — it goes stale on the next push', c[0]);
      const h = s.match(BY_HAND);
      if (h) add(`${file} ${path}`, 'asserts how the work was made', h[0]);
      const d = s.match(FUTURE_DATE);
      if (d) add(`${file} ${path}`, 'names a date that will expire', d[0]);
    }
  }

  /* check 7's copy rules, as far as they can be checked here. */
  for (const p of files['projects.json']?.projects || []) {
    if (p.hidden || p.status === 'missing') continue;
    if (!p.blurb) add(`projects.json ${p.id}`, 'is visible with no blurb', '');
    else if (p.blurb.length > BLURB_MAX) {
      add(`projects.json ${p.id}`, `blurb is ${p.blurb.length} characters (max ${BLURB_MAX})`, p.blurb.slice(0, 50));
    }
    if (p.folder === 'unsorted') add(`projects.json ${p.id}`, 'is visible but still in `unsorted`', '');
  }
  return out;
}
