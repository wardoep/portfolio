/* flicker-test.mjs — a panel must animate open exactly once.
 *
 * Reported as "it pops in, which is great, but it's flickering". It is a race
 * between two authors of the same properties, and it fires at BOTH ends of the
 * open:
 *
 *   .panel carries `animation: panelIn ... both` in CSS, and the scripted FLIP
 *   disarms it with `.panel--zoom { animation: none !important }`.
 *
 *   1. show() sets `hidden = false` and then forces two style flushes — a
 *      getBoundingClientRect for the trigger and one for the panel — before
 *      that class is added. panelIn genuinely starts, at opacity 0.
 *   2. Worse, and this is the visible one: when the zoom finishes, panels.js
 *      REMOVES panel--zoom. That lifts `animation: none` and re-arms the
 *      keyframe, so panelIn plays a second time — the panel settles into place
 *      and then flashes and re-scales from .96.
 *
 * The second one is why a 200ms sample window missed it entirely: the replay
 * starts at ~420ms, after the zoom has finished. Sample the whole open.
 */
import { connect, reporter } from './cdp.mjs';

const { ev, wait, load, escape, errors } = await connect({ width: 1440, height: 900 });
const { check, done } = reporter();

/* Animation EVENTS, not rAF polling. The click handler runs to completion
   synchronously, so a keyframe can be started and cancelled between two frames
   and no amount of sampling will see it. animationstart fires either way. */
const LISTEN = `
  window.__css = [];
  for (const t of ['animationstart', 'animationcancel', 'animationend']) {
    document.addEventListener(t, (e) => {
      if (!e.target.classList || !e.target.classList.contains('panel')) return;
      window.__css.push(t + ':' + e.animationName);
    }, true);
  }`;

/* Watch the panel that is actually open — not document.querySelector('.panel'),
   which is the first one in the DOM and is usually hidden. */
const WATCH = `(async (frames) => {
  const seen = [];
  for (let i = 0; i < frames; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const p = document.querySelector('.panel:not([hidden])');
    if (!p) { seen.push(null); continue; }
    const cs = getComputedStyle(p);
    seen.push({
      n: p.getAnimations().length,
      opacity: +cs.opacity,
      scale: +(new DOMMatrixReadOnly(cs.transform).a).toFixed(3),
      zoom: p.classList.contains('panel--zoom'),
    });
  }
  return JSON.stringify(seen);
})`;

console.log('\nOPENING A PROJECT — the pop that flickers');
await load('#/projects');
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | ').slice(0, 160));

{
  await ev(LISTEN);
  /* 48 frames ~ 800ms, which covers the 420ms zoom AND the window in which the
     re-armed keyframe replays. */
  const frames = JSON.parse(await ev(
    `(() => { document.querySelector('.chan').click(); return (${WATCH})(48); })()`)).filter(Boolean);
  const css = await ev(`window.__css.join(' ')`);

  console.log(`     css animation events on the panel: ${css || '(none)'}`);
  console.log(`     concurrent animations per frame: ${[...new Set(frames.map((f) => f.n))].join('/')}`);

  /* THE claim. With a trigger to grow out of, the scripted zoom owns the whole
     open and the CSS keyframe must never run — not at the start, not as a
     replay when the class is removed at the end. */
  check('the CSS keyframe never runs when the zoom owns the open',
    !css.includes('panelIn'), css);

  check('never two animations on the panel at once',
    frames.every((f) => f.n <= 1), `peak ${Math.max(...frames.map((f) => f.n))}`);

  /* The visible symptom, measured in pixels rather than inferred: once the
     panel has become visible it must never dim or shrink again. */
  let peakO = 0, peakS = 0, dips = [];
  for (const f of frames) {
    if (f.opacity < peakO - 0.05) dips.push(`opacity ${peakO.toFixed(2)}->${f.opacity.toFixed(2)}`);
    if (f.scale < peakS - 0.02) dips.push(`scale ${peakS.toFixed(2)}->${f.scale.toFixed(2)}`);
    peakO = Math.max(peakO, f.opacity);
    peakS = Math.max(peakS, f.scale);
  }
  check('it never dims or shrinks back once it is up', dips.length === 0,
    dips.slice(0, 3).join(', '));

  check('it ends at full size and fully opaque',
    Math.abs(frames.at(-1).opacity - 1) < 0.01 && Math.abs(frames.at(-1).scale - 1) < 0.01,
    `opacity ${frames.at(-1).opacity}, scale ${frames.at(-1).scale}`);

  await escape();
  await wait(800);
}

/* A deep link has no trigger to grow out of, so the fade is correct there — but
   it must play exactly once, and it must actually play. */
console.log('\nDEEP LINK — no trigger, so the fade path');
{
  await load('');
  await ev(LISTEN);
  await ev(`location.hash = '#/about'`);
  const frames = JSON.parse(await ev(`(${WATCH})(30)`)).filter(Boolean);
  const css = await ev(`window.__css.join(' ')`);
  console.log(`     css animation events on the panel: ${css || '(none)'}`);

  check('a deep-linked panel is visible', frames.length > 0);
  /* The fade is scripted now, like the zoom — one mechanism for both, which is
     the whole point. So the claim is not "one CSS keyframe fired" but "no CSS
     keyframe fired at all, and exactly one scripted animation did". */
  check('no CSS keyframe is involved at all', css === '', css);
  check('it really animates rather than snapping on',
    frames[0].opacity < 0.9 && frames.some((f) => f.n === 1),
    `first frame opacity ${frames[0].opacity}`);
  check('never two animations at once here either',
    frames.every((f) => f.n <= 1), `peak ${Math.max(...frames.map((f) => f.n))}`);
  check('it settles fully opaque',
    Math.abs(frames.at(-1).opacity - 1) < 0.01, String(frames.at(-1).opacity));
}

done('a panel animates open exactly once, from one author.');
