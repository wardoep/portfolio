/* shots.mjs — screenshots of every screen in both themes, for eyeballing.
 *
 *   node tests/shots.mjs [outdir]
 *
 * Not a gate. Screenshots cannot tell a 3ms frame from a 40ms one and they
 * cannot see a one-frame flicker, which is exactly why the other suites in here
 * measure instead of looking. This is for the things only a person can judge.
 */
import { connect } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/pf-shots';
mkdirSync(OUT, { recursive: true });

const { ev, send, wait, load } = await connect({ width: 1440, height: 900 });

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log(`  ${OUT}/${name}.png`);
};

for (const theme of ['light', 'dark']) {
  for (const [name, hash] of [['menu', ''], ['projects', '#/projects'], ['about', '#/about']]) {
    await load(hash);
    await ev(`document.documentElement.dataset.theme = '${theme}'`);
    /* let the star field draw a few frames at its 16fps, and any open finish */
    await wait(1400);
    await shot(`${theme}-${name}`);
  }
}

/* the start screen, on a genuine first visit */
await load();
await ev(`sessionStorage.removeItem('pf-booted')`);
await send('Page.navigate', { url: 'about:blank' });
await wait(150);
await send('Page.navigate', { url: (await import('./cdp.mjs')).BASE });
await wait(1600);
await shot('boot');

process.exit(0);
