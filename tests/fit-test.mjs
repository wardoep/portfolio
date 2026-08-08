/* fit-test.mjs — the layout gate. Nothing clips, nothing is covered, the bar
 * is centred on the clock.
 *
 * Every claim in here corresponds to a bug that shipped:
 *
 *   - A project tile computed 259x195 while its children came to exactly 195px
 *     WITH A ONE-LINE LABEL. Every title that wrapped overflowed, and above
 *     901px `body { overflow: hidden }` means a too-tall tile does not scroll,
 *     it clips in silence with no scrollbar anywhere to give it away.
 *   - `.level` was absolutely positioned with no z-index and sat before .grid
 *     in the DOM, so the tiles painted over the word PROJECTS at four of the
 *     eight viewports.
 *   - The clock sat 80px right of centre because four buttons flanked it on the
 *     left and two on the right.
 *
 * None of the three is visible in a screenshot at a glance, and all three are
 * one measurement away from obvious.
 */
import { connect, reporter } from './cdp.mjs';

const VIEWS = [
  [1920, 1080], [1600, 900], [1440, 900], [1366, 768],
  [1280, 720], [1024, 768], [820, 1180], [390, 844],
];

const { ev, viewport, wait, load } = await connect();
const { check, done } = reporter();

/* Measured inside the page so the numbers are the browser's, not arithmetic I
   did in my head and could get wrong in the same direction twice. */
const MEASURE = `(() => {
  const tiles = [...document.querySelectorAll('.chan')];
  const over = tiles
    .map((t) => ({
      id: t.dataset.card,
      dy: t.scrollHeight - t.clientHeight,
      dx: t.scrollWidth - t.clientWidth,
    }))
    .filter((r) => r.dy > 1 || r.dx > 1);

  /* elementFromPoint, not a rect comparison: the title and the grid may overlap
     harmlessly if the title still wins the paint order, and they may share no
     rect at all while a transform puts a tile on top. Only hit-testing answers
     the question the eye is actually asking. */
  const title = document.querySelector('.level:not([hidden])');
  let cover = null;
  if (title) {
    const r = title.getBoundingClientRect();
    if (r.width && r.height) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && !title.contains(hit) && hit !== title) cover = hit.className || hit.tagName;
    }
  }
  const first = tiles[0] && tiles[0].getBoundingClientRect();
  return JSON.stringify({
    n: tiles.length,
    over,
    cover,
    titleShown: !!title,
    tile: first ? Math.round(first.width) + 'x' + Math.round(first.height) : 'none',
    pageScroll: document.documentElement.scrollHeight - window.innerHeight,
  });
})()`;

/* The clock is the middle of the bar and has to be the middle of the SCREEN. */
const DOCK = `(() => {
  const c = document.querySelector('.dock__clock');
  if (!c || !c.getClientRects().length) return JSON.stringify({ skip: true });
  const r = c.getBoundingClientRect();
  return JSON.stringify({ off: Math.round(r.left + r.width / 2 - innerWidth / 2) });
})()`;

for (const [w, h] of VIEWS) {
  await viewport(w, h);

  for (const [label, hash] of [['root', ''], ['projects', '#/projects'], ['builds', '#/builds']]) {
    await load(hash);
    await wait(250);
    const m = JSON.parse(await ev(MEASURE));
    const tag = `${w}x${h} ${label}`.padEnd(22);

    check(`${tag} ${String(m.n).padStart(2)} tiles @ ${m.tile} — nothing clipped`,
      m.over.length === 0,
      m.over.slice(0, 3).map((o) => `${o.id} overflows by ${o.dy}px`).join(', '));

    if (m.titleShown) {
      check(`${tag} the title is not under a tile`, m.cover === null, String(m.cover));
    }
    /* Above 900px the requirement is absolute: one screen, no vertical scroll.
       Below it the document is allowed to scroll — there is no honest way to
       fit thirteen readable cards on a phone. */
    if (w > 900) {
      check(`${tag} the page does not scroll`, m.pageScroll <= 1, `${m.pageScroll}px over`);
    }
  }

  /* once per viewport, not once per level — the bar does not change between them */
  const d = JSON.parse(await ev(DOCK));
  if (!d.skip) {
    check(`${(w + 'x' + h).padEnd(22)}the clock is centred on screen`,
      Math.abs(d.off) <= 2, `${d.off > 0 ? '+' : ''}${d.off}px`);
  }
}

done('every tile holds its contents, the title is never covered, the bar is centred.');
