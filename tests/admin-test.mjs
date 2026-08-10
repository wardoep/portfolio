/* admin-test.mjs — the editor, and the lock on it.
 *
 *   PF_BASE=http://127.0.0.1:8099/portfolio/ node tests/admin-test.mjs
 *
 * The load-bearing checks in here are NOT about the UI. They are:
 *
 *   1. On a site with no local write endpoint the editor does not exist — the
 *      module is never fetched and the route does nothing. That is what makes
 *      penna.lol safe, not the password.
 *   2. The password is enforced by the SERVER. Proven with fetch() straight at
 *      the endpoint rather than by driving the screen, because the screen is
 *      bypassable by definition and testing it would prove nothing.
 *   3. A save cannot corrupt the site: invalid JSON is refused before the file
 *      is touched, and only three files can be written at all.
 */
import { connect, reporter, BASE } from './cdp.mjs';
import { readFileSync } from 'node:fs';
import { PRIVATE } from '../assets/js/rules.js';

const PW = readFileSync(new URL('../.admin-pw', import.meta.url), 'utf8').trim();
const API = BASE + '__admin/';

/* A string this file must never contain, built from the rule meant to catch it.
 *
 * Pages serves the whole branch, so tests/ is as public as index.html —
 * https://penna.lol/tests/admin-test.mjs is a live URL. Typing a real phone
 * number here to prove the rule catches phone numbers would publish it, and
 * splitting the digits across two literals only hides them from publish.sh's
 * grep, not from anyone reading the file. So the probe is derived: strip a
 * pattern back to the plainest text that still matches it.
 *
 * The rules keep their secrets in character classes (`797[1]`) precisely so the
 * source never spells them out; this reverses that, in memory, at run time. */
const probeFor = (re) => re.source
  .replace(/\\b/g, '')            /* a word boundary is not a character */
  .replace(/\[[^\]]*\]\?/g, '')   /* an optional class: leave it out entirely */
  .replace(/\\.\?/g, '')          /* an optional literal: likewise */
  .replace(/\[(.)\]/g, '$1')      /* a one-character class IS that character */
  .replace(/\\(.)/g, '$1');       /* and unescape whatever is left */

const PROBES = PRIVATE.map(([re, what]) => [probeFor(re), what]);
/* Every private rule, plus a count, a by-hand claim and a date that has gone
   past — one sentence that should trip six rules at once. */
const BAD_SENTENCE = `Ring ${PROBES[0][0]} or ${PROBES[1][0]}, ${PROBES[2][0]} `
  + 'about my 13 labs, built by hand, exam scheduled March 2020.';

const { ev, send, wait, load, count, errors } = await connect({ width: 1440, height: 900 });
const { check, done } = reporter();

/* ── the lock, from outside the browser UI ─────────────────────────────── */
console.log('\nTHE LOCK');
{
  const put = async (key, body, file = 'content.json') => {
    const r = await fetch(API + file, {
      method: 'PUT',
      headers: key === null ? {} : { 'X-Admin-Key': key },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return r.status;
  };
  const current = await (await fetch(BASE + 'data/content.json')).json();

  check('no key is refused', (await put(null, current)) === 403);
  check('a wrong key is refused', (await put('hunter2', current)) === 403);
  check('an almost-right key is refused', (await put(PW.slice(0, -1), current)) === 403);
  check('a file outside the allowlist is refused',
    (await put(PW, {}, 'index.html')) === 400);
  check('invalid JSON is refused before anything is written',
    (await put(PW, 'not json at all')) === 400);
  /* and the file survived all of that */
  const after = await (await fetch(BASE + 'data/content.json?x=' + Date.now())).json();
  check('content.json is untouched by every refusal',
    JSON.stringify(after) === JSON.stringify(current));
  check('the right key is accepted', (await put(PW, current)) === 200);
}

/* ── a real round trip ─────────────────────────────────────────────────── */
console.log('\nSAVE REACHES THE PAGE');
{
  const doc = await (await fetch(BASE + 'data/content.json?x=' + Date.now())).json();
  const about = doc.panels.find((p) => p.id === 'about');
  const original = about.body[0].html;
  const marker = 'ROUND TRIP ' + Math.random().toString(36).slice(2, 8);

  about.body[0].html = marker;
  const r = await fetch(API + 'content.json', {
    method: 'PUT',
    headers: { 'X-Admin-Key': PW, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  const out = await r.json();
  check('the save is accepted', r.ok, JSON.stringify(out).slice(0, 90));
  check('and it baked index.html on the way through',
    (out.baked || []).join(' ').includes('index.html'), JSON.stringify(out.baked));

  /* the words must be in the SOURCE, not injected — that is the whole reason
     for the bake step existing */
  const html = await (await fetch(BASE + '?x=' + Date.now())).text();
  check('the new copy is in the page source', html.includes(marker));

  about.body[0].html = original;
  await fetch(API + 'content.json', {
    method: 'PUT',
    headers: { 'X-Admin-Key': PW, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  const back = await (await fetch(BASE + '?x=' + Date.now())).text();
  check('and putting it back leaves no trace', !back.includes('ROUND TRIP'));
}

/* ── the editor in the browser ─────────────────────────────────────────── */
console.log('\nTHE EDITOR');
{
  await load();
  check('no JavaScript errors on the normal page', errors.length === 0,
    errors.slice(0, 2).join(' | ').slice(0, 140));
  check('admin.js is NOT loaded until it is asked for', await ev(`
    performance.getEntriesByType('resource').every((e) => !e.name.includes('admin.js'))`));

  await load('#/admin');
  await wait(900);
  check('the password gate appears first', (await count('.alock')) === 1);
  check('and the editor itself is not mounted yet', (await count('.admin__bar')) === 0);

  await ev(`(() => {
    const f = document.querySelector('.alock');
    f.querySelector('input').value = ${JSON.stringify(PW)};
    f.requestSubmit();
  })()`);
  await wait(900);
  check('the right password unlocks it', (await count('.admin__bar')) === 1);
  check('all four tabs are there', (await count('[data-atab]')) === 4);

  /* The picker must not be able to choose an icon the sprite lacks — publish.sh
     check 9 fails the build on exactly that, so an editor that could pick one
     would be handing you a broken commit. */
  await ev(`document.querySelector('[data-atab="panels"]').click()`);
  await wait(400);
  const bad = await ev(`(() => {
    const ids = [...document.querySelectorAll('.sprite g[id^="i-"]')].map((g) => g.id);
    return [...document.querySelectorAll('.apick__i')]
      .map((b) => b.title).filter((t) => !ids.includes(t));
  })()`);
  check('the icon picker only offers glyphs that exist', bad.length === 0, String(bad));

  await ev(`document.querySelector('[data-atab="projects"]').click()`);
  await wait(400);
  check('projects are listed for editing', (await ev(`document.querySelectorAll('.acard').length`)) > 5);
}

/* ── the typed trigger ─────────────────────────────────────────────────── */
console.log('\nTYPING THE WORD');
{
  await load('');
  await ev(`sessionStorage.removeItem('pf-admin-key')`);
  await load('');
  /* Real key events through the input pipeline, not a synthetic hash change —
     the trigger was never tested this way and "when i type admin nothing is
     happening" is exactly the report that finds out. */
  for (const ch of 'admin') {
    const code = 'Key' + ch.toUpperCase();
    const vk = ch.toUpperCase().charCodeAt(0);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk });
    await wait(70);
  }
  await wait(1200);
  check('typing the word opens the editor',
    (await ev(`location.hash`)) === '#/admin' && (await count('.admin')) === 1);

  /* And it must not fire while you are typing INTO the editor. */
  await wait(300);
  const before = await ev(`location.hash`);
  await ev(`(() => { const i = document.querySelector('.af__input'); if (i) i.focus(); })()`);
  for (const ch of 'admin') {
    const code = 'Key' + ch.toUpperCase();
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) });
    await wait(50);
  }
  check('and does not re-fire while a field has focus',
    (await ev(`location.hash`)) === before, await ev(`location.hash`));
}

/* ── the rules refuse a bad save ───────────────────────────────────────────
 * The editor can publish straight to the repo from penna.lol, where publish.sh
 * is not in the way until CI runs. These are what stand between a typo and a
 * permanently-archived public URL, so they are checked in the browser, on the
 * real module, not just in node. */
console.log('\nTHE RULES');
{
  const found = await ev(`(async () => {
    const rules = await import('./assets/js/rules.js');
    const content = await (await fetch('data/content.json')).json();
    const clean = rules.check({ 'content.json': content }).length;
    const bad = JSON.parse(JSON.stringify(content));
    bad.panels.find((p) => p.id === 'about').body[0].html = ${JSON.stringify(BAD_SENTENCE)};
    return JSON.stringify({ clean, dirty: rules.check({ 'content.json': bad }).map((f) => f.why) });
  })()`);
  const r = JSON.parse(found);
  check('the live content passes its own rules', r.clean === 0, String(r.clean));
  /* Each private rule by name, so adding one to rules.js without a working
     pattern shows up here rather than passing on the strength of the others. */
  for (const [, what] of PROBES) {
    check(`${what} is caught`, r.dirty.some((w) => w.includes(what)), r.dirty.join(' | '));
  }
  check('a count is caught', r.dirty.some((w) => w.includes('counts')));
  check('an expired date is caught', r.dirty.some((w) => w.includes('expire')));
  check('a by-hand claim is caught', r.dirty.some((w) => w.includes('how the work')));
}

/* ── the bakers are the same code in both places ───────────────────────── */
console.log('\nONE SET OF GENERATORS');
{
  /* If the browser and the terminal templated differently, a save from
     penna.lol and a local bake would write different bytes from identical data,
     and check 16 would fail on whichever ran second. */
  const same = await ev(`(async () => {
    const { applyPanels } = await import('./assets/js/bake.js');
    const doc = await (await fetch('data/content.json')).json();
    const html = await (await fetch('index.html')).text();
    return applyPanels(html, doc) === html;
  })()`);
  check('baking the live content in the browser reproduces index.html exactly', same);
}

done('the editor works and the lock holds.');
