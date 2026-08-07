/* stars.js — the pixel field behind everything.
 *
 * Ported from a React/Tailwind component rather than installed as one. This
 * site ships hand-written CSS and ES modules straight to Pages with no build
 * step, which is precisely why publish.sh can assert what production serves by
 * reading the repo; adding a bundler to place one background would trade that
 * for a compile artifact nobody can check.
 *
 * Kept from the original: the 16fps frame skip (the cadence IS the look — at
 * 60fps this reads as a screensaver, at 16 it reads as hardware), square fill
 * rects on a grid, a two-state twinkle rather than a smooth fade, periodic
 * regeneration of part of the field, and a shooting star with a fading trail.
 *
 * Changed on purpose:
 *
 *   COLOUR comes from the theme. The original picks from seven pastel hues,
 *   which would be the only colour anywhere on a site whose palette says "no
 *   hue anywhere". Dark theme gets white stars on black. Light theme gets the
 *   same code with the ink inverted — dust settling on the board, not a
 *   starfield printed on paper.
 *
 *   THE BACKING STORE IS CSS-SIZED, ignoring devicePixelRatio, exactly as the
 *   original does. On a 2x display the browser upscales, and with
 *   `image-rendering: pixelated` that upscale is nearest-neighbour — so the
 *   pixels stay square and get chunkier, which is the point. It also halves
 *   the fill cost.
 *
 * And three bugs in the source that are not carried over:
 *
 *   1. createShootingStar() re-arms itself with setTimeout and the cleanup only
 *      ever cleared the regeneration interval — so the chain outlives teardown
 *      and keeps pushing into a dead component's ref forever. The id is held
 *      and cleared here.
 *   2. globalAlpha is left at the last background star's opacity when the trail
 *      draws, so the trail's own rgba() alpha is silently multiplied by it.
 *   3. The trail does translate(p) / rotate / translate(-p) around coordinates
 *      that were never rotated, which cancels to a no-op costing two matrix
 *      multiplies per trail point per frame. Dropped.
 */

const FPS = 16;
const FRAME = 1000 / FPS;
const PIXEL = 5;                 /* one "pixel" of the field, in CSS px */
const DENSITY = 0.00004;         /* stars per square px */
const TWINKLE_CHANCE = 0.7;
const TWINKLE_MIN = 2, TWINKLE_MAX = 4;   /* seconds per half cycle */
const REGEN_MS = 5000, REGEN_SHARE = 0.15;
const TRAIL_PIXEL = 2;

let canvas = null;
let ctx = null;
let stars = [];
let shooting = [];
let raf = 0;
let regenTimer = 0;
let shootTimer = 0;
let last = 0;
let paint = { ink: '#ffffff', alpha: 0.8, streak: '#ffffff' };

const still = () =>
  document.documentElement.dataset.motion === 'off' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Read the palette out of CSS rather than duplicating it here, so the theme
   toggle and the token file stay the single source of truth. */
function readPaint() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, fallback) => (cs.getPropertyValue(n) || '').trim() || fallback;
  paint = {
    ink: v('--star-ink', '#ffffff'),
    alpha: parseFloat(v('--star-alpha', '.8')) || 0.8,
    streak: v('--star-streak', '#ffffff'),
  };
}

function makeStar() {
  const speed = TWINKLE_MIN + Math.random() * (TWINKLE_MAX - TWINKLE_MIN);
  return {
    x: Math.floor(Math.random() * (canvas.width / PIXEL)) * PIXEL,
    y: Math.floor(Math.random() * (canvas.height / PIXEL)) * PIXEL,
    base: 0.5 + Math.random() * 0.5,
    twinkles: Math.random() < TWINKLE_CHANCE,
    speed,
    timer: Math.random() * speed,   /* staggered, or the whole field blinks as one */
    dim: false,
  };
}

function seed() {
  if (!canvas) return;
  const n = Math.floor(canvas.width * canvas.height * DENSITY);
  stars = Array.from({ length: n }, makeStar);
}

function regen() {
  if (!stars.length) return;
  const n = Math.max(1, Math.floor(stars.length * REGEN_SHARE));
  for (let i = 0; i < n; i++) stars[Math.floor(Math.random() * stars.length)] = makeStar();
}

function makeShootingStar() {
  return {
    x: Math.random() * canvas.width,
    y: 0,
    /* 90deg is straight down; 45..135 fans it out either side */
    angle: 45 + Math.random() * 90,
    speed: 8 + Math.random() * 5,
    travelled: 0,
    trail: [],
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = paint.ink;
  for (const s of stars) {
    ctx.globalAlpha = (s.twinkles && s.dim ? s.base * 0.3 : s.base) * paint.alpha;
    ctx.fillRect(s.x, s.y, PIXEL, PIXEL);
  }

  ctx.globalAlpha = 1;
  for (const s of shooting) {
    for (const p of s.trail) {
      ctx.globalAlpha = p.life * paint.alpha;
      ctx.fillStyle = paint.streak;
      ctx.fillRect(p.x, p.y, TRAIL_PIXEL, TRAIL_PIXEL);
    }
    /* the head: a 4x2 block with two corners knocked out, so it reads as a
       sprite rather than a rectangle */
    ctx.globalAlpha = paint.alpha;
    ctx.fillStyle = paint.ink;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        if ((x === 0 && y === 1) || (x === 3 && y === 0)) continue;
        ctx.fillRect(s.x + x * TRAIL_PIXEL, s.y + y * TRAIL_PIXEL, TRAIL_PIXEL, TRAIL_PIXEL);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function step() {
  for (const s of stars) {
    if (!s.twinkles) continue;
    s.timer += 1 / FPS;
    if (s.timer >= s.speed) { s.timer = 0; s.dim = !s.dim; }
  }

  for (const s of shooting) {
    const rad = (s.angle * Math.PI) / 180;
    if (s.travelled % 8 < s.speed) s.trail.push({ x: s.x, y: s.y, life: 1 });
    s.x += s.speed * Math.cos(rad);
    s.y += s.speed * Math.sin(rad);
    s.travelled += s.speed;
    s.trail = s.trail.map((p) => ({ ...p, life: p.life - 0.1 })).filter((p) => p.life > 0);
  }
  shooting = shooting.filter(
    (s) => s.x >= -30 && s.x <= canvas.width + 30 && s.y >= -30 && s.y <= canvas.height + 30);
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  if (now - last < FRAME) return;
  last = now;
  step();
  draw();
}

function start() {
  if (raf || !canvas) return;
  last = 0;
  raf = requestAnimationFrame(loop);
  regenTimer = setInterval(regen, REGEN_MS);
  const arm = () => {
    shooting.push(makeShootingStar());
    shootTimer = setTimeout(arm, 2000 + Math.random() * 4000);
  };
  shootTimer = setTimeout(arm, 1200);
}

function stop() {
  cancelAnimationFrame(raf); raf = 0;
  clearInterval(regenTimer); regenTimer = 0;
  clearTimeout(shootTimer); shootTimer = 0;
  shooting = [];
}

function size() {
  if (!canvas) return;
  /* CSS pixels, not device pixels — see the header. */
  canvas.width = Math.max(1, innerWidth);
  canvas.height = Math.max(1, innerHeight);
  seed();
}

/* The theme toggle and the motion toggle both land here. Under reduced motion
   the field is painted ONCE and the loop never starts: a still starfield is
   still a background, whereas removing it would make the two settings render
   visibly different pages. */
export function refresh() {
  if (!canvas) return;
  readPaint();
  if (still()) { stop(); draw(); return; }
  start();
}

export function init() {
  canvas = document.querySelector('[data-stars]');
  if (!canvas || !canvas.getContext) return;
  ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  readPaint();
  size();

  addEventListener('resize', () => { size(); if (still()) draw(); });

  /* Both the theme and the motion switch are attributes on <html>, so watching
     the element is one mechanism that cannot be forgotten. The alternative —
     every caller that flips a theme remembering to notify the canvas — already
     failed once: the field kept its light ink on a black ground and simply was
     not there, which looks exactly like a background nobody has noticed yet. */
  new MutationObserver(refresh).observe(document.documentElement,
    { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });

  /* rAF is throttled in a background tab but the shooting-star timeout chain is
     not, so it would queue up a burst that all arrives at once on return. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else refresh();
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refresh);

  refresh();
}
