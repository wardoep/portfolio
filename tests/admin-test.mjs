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

const PW = readFileSync(new URL('../.admin-pw', import.meta.url), 'utf8').trim();
const API = BASE + '__admin/';

const { ev, wait, load, count, errors } = await connect({ width: 1440, height: 900 });
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

done('the editor works and the lock holds.');
