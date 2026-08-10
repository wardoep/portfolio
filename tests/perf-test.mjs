/* perf-test.mjs — sixty frames a second, asserted rather than assumed.
 *
 * This exists because of a regression that shipped. menu.css carried a comment
 * saying the lift shadow and the ring are PAINT properties and must cross-fade
 * on ::after rather than be transitioned; a later change wrote box-shadow back
 * into the tile's transition and deleted the ::after. Every hover then
 * repainted a 460px tile plus a 30px blur, every frame, immediately before
 * every click. Nothing caught it: screenshots look identical whether a frame
 * took 3ms or 40ms, and every other suite passed.
 *
 * Three layers, because one of them alone would be misleading:
 *
 *   1. STATIC — no transition anywhere may name a paint-only property. This is
 *      the real check. It is deterministic and, unlike a frame counter, it does
 *      not care whether the machine running it has a GPU.
 *   2. FRAME BUDGET — measured through real input, with a threshold loose
 *      enough that a software renderer having a bad moment does not fail the
 *      build for the wrong reason.
 *   3. THE CANVAS — the star field is deliberately 16fps, and that number is
 *      held from BOTH sides: it must not creep up (cost) and must stop dead
 *      when motion is off.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, reporter } from './cdp.mjs';

const CSS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'css');

/* The two classes that actually cost something at 60fps:
     BLUR   — a shadow or filter has to be re-blurred on every frame
     LAYOUT — geometry forces the whole box tree to be re-solved
   Deliberately NOT listed: color, background-color, border-color. Those are
   paint too, but on a 34px icon button they are free, and a gate that flags
   harmless things is a gate people learn to ignore. */
const EXPENSIVE = [
  'box-shadow', 'filter', 'backdrop-filter',
  'top', 'left', 'right', 'bottom', 'width', 'height', 'margin', 'padding',
];
const CHEAP = new Set(['opacity', 'transform', 'none', 'outline', 'outline-color', 'color']);

const { check, done } = reporter();

console.log('\nSTATIC — no paint-only property in any transition');
{
  const offenders = [];
  for (const f of readdirSync(CSS_DIR).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(`${CSS_DIR}/${f}`, 'utf8');
    /* Blank the comments rather than deleting them, so offsets still map to
       real line numbers — a gate that points at the wrong line wastes the time
       it was meant to save. */
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of bare.matchAll(/transition:\s*([^;}]+)[;}]/g)) {
      for (const part of m[1].replace(/\s+/g, ' ').trim().split(',')) {
        const prop = part.trim().split(/\s+/)[0];
        if (!prop || CHEAP.has(prop)) continue;
        if (EXPENSIVE.includes(prop)) {
          offenders.push(`${f}:${bare.slice(0, m.index).split('\n').length} transitions ${prop}`);
        }
      }
    }
  }
  check('no transition animates a blur-heavy or layout property',
    offenders.length === 0, offenders.slice(0, 4).join(' | '));
}

console.log('\nSTATIC — no full-viewport backdrop blur');
{
  const found = readdirSync(CSS_DIR).filter((n) => n.endsWith('.css'))
    .filter((f) => /backdrop-filter\s*:/.test(
      readFileSync(`${CSS_DIR}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
  /* The scrim covers the whole viewport and the panel scales over it, so the
     blur would be recomputed every frame of every open. */
  check('nothing declares backdrop-filter', found.length === 0, found.join(', '));
}

const { ev, send, wait, load, escape, count } = await connect({ width: 1440, height: 900 });

/* Count frames through a real interaction driven through the input pipeline,
   not through .click(). */
async function frames(label, act) {
  /* A generation token, not a shared boolean. With `window.__stop = false` the
     PREVIOUS run's rAF loop reads the same global, sees false and resurrects —
     so two loops push per frame, half the deltas come out as 0ms, and the
     median reads 0. A gate reporting a 0ms frame is not measuring anything. */
  await ev(`window.__gen = (window.__gen || 0) + 1;
    window.__f = []; window.__last = performance.now();
    (function tick(now, mine){ if (mine !== window.__gen) return;
      window.__f.push(now - window.__last); window.__last = now;
      requestAnimationFrame((t) => tick(t, mine)); })(performance.now(), window.__gen);`);
  await act();
  const s = JSON.parse(await ev(`(() => {
    window.__gen++;                       /* retires the loop above */
    const f = window.__f.slice(2);
    if (!f.length) return JSON.stringify({ n: 0 });
    const sorted = f.slice().sort((a, b) => a - b);
    return JSON.stringify({
      n: f.length,
      median: +sorted[Math.floor(f.length / 2)].toFixed(1),
      p90: +sorted[Math.floor(f.length * 0.9)].toFixed(1),
      longest: +Math.max(...f).toFixed(1),
      over40: f.filter((d) => d > 40).length,
    });
  })()`));
  console.log(`     ${label.padEnd(16)} ${s.n} frames, median ${s.median}ms, ` +
              `p90 ${s.p90}ms, longest ${s.longest}ms`);
  /* 18ms, not 16.7: this headless shell renders in software and a hard p100 at
     the refresh interval would fail for reasons that have nothing to do with
     the CSS. A median above 18 means something is genuinely repainting. */
  check(`${label}: holds 60fps`, s.median <= 18, `median ${s.median}ms`);
  check(`${label}: no dropped-frame stall`, s.over40 === 0, `${s.over40} frames over 40ms`);
  return s;
}

console.log('\nFRAME BUDGET — through real input');
await load();
{
  const box = JSON.parse(await ev(`(() => {
    const r = document.querySelector('.chan[data-card="projects"]').getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`));

  await frames('hover a card', async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
    await wait(500);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + 3, y: box.y + 3, buttons: 0 });
    await wait(400);
  });

  await frames('open a channel', async () => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(900);
  });
  /* Derived, not hardcoded. This said 13, which was true until a repo went
     private and the wall became 12 — a performance suite failing because of a
     GitHub visibility change is a false alarm that teaches you to ignore it. */
  const want = await ev(`(async () => {
    const d = await (await fetch('data/projects.json')).json();
    const c = d.channels.find((x) => x.id === 'projects');
    return d.projects.filter((p) => (c.folders || []).includes(p.folder)
      && !p.hidden && p.status !== 'missing').length;
  })()`);
  check('the menu actually swapped', (await count('.chan')) === want,
    `${await count('.chan')} tiles, data says ${want}`);

  const p = JSON.parse(await ev(`(() => {
    const r = document.querySelector('.chan').getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`));
  await frames('open a panel', async () => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await wait(900);
  });
  check('the panel actually opened',
    /^p-project-/.test(await ev(`document.querySelector('.panel:not([hidden])')?.id || ''`)));
  await escape(); await wait(700);
}

console.log('\nTHE PIXEL FIELD — deliberately 16fps, held from both sides');
{
  await load();
  check('the canvas exists and is sized', await ev(`(() => {
    const c = document.querySelector('[data-stars]');
    return !!c && c.width > 100 && c.height > 100;
  })()`));

  check('it sits below the stage and takes no pointer events', await ev(`(() => {
    const c = getComputedStyle(document.querySelector('[data-stars]'));
    const s = getComputedStyle(document.querySelector('.stage'));
    return +c.zIndex < +s.zIndex && c.pointerEvents === 'none';
  })()`));

  /* The backing store is deliberately CSS-sized rather than DPR-scaled — that
     is what keeps the upscale chunky. Asserted so a well-meaning "fix" that
     multiplies by devicePixelRatio has to argue with a comment first. */
  check('the backing store is CSS-sized, not DPR-scaled',
    await ev(`Math.abs(document.querySelector('[data-stars]').width - innerWidth) <= 1`));

  /* A canvas that is present, sized and entirely blank is exactly the failure a
     screenshot at the wrong moment would call fine. */
  check('it actually paints pixels', await ev(`(() => {
    const c = document.querySelector('[data-stars]');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  })()`));

  const draws = JSON.parse(await ev(`(async () => {
    const ctx = document.querySelector('[data-stars]').getContext('2d');
    const real = ctx.clearRect.bind(ctx);
    let n = 0;
    ctx.clearRect = (...a) => { n++; return real(...a); };
    await new Promise((r) => setTimeout(r, 1000));
    return JSON.stringify({ n });
  })()`));
  console.log(`     ${draws.n} draws in 1s (16fps target)`);
  check('the field stays at its retro cadence', draws.n <= 20, `${draws.n} draws/s`);

  await ev(`localStorage.setItem('pf-motion', 'off')`);
  await load();
  const off = JSON.parse(await ev(`(async () => {
    const c = document.querySelector('[data-stars]');
    const ctx = c.getContext('2d');
    const real = ctx.clearRect.bind(ctx);
    let n = 0;
    ctx.clearRect = (...a) => { n++; return real(...a); };
    await new Promise((r) => setTimeout(r, 900));
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let painted = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { painted = true; break; }
    return JSON.stringify({ n, painted });
  })()`));
  check('motion off stops the loop dead', off.n === 0, `${off.n} draws with motion off`);
  /* Still painted, though: switching animation off should not silently delete
     the page's background and make the two settings different designs. */
  check('but the field is still on screen', off.painted);
  await ev(`localStorage.removeItem('pf-motion')`);
}

done('sixty frames a second, and the field behaves.');
