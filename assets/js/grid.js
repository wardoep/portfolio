/* grid.js — the menu, at whichever level you are on.
 *
 * The stage holds one wall of tiles. At the root that wall is the three
 * channels; open one and the SAME wall becomes that channel's projects. It is
 * not a modal on top of the menu — it is the menu, showing something else,
 * which is what the console this imitates actually does.
 *
 * Columns and rows are computed from the count and handed to the CSS, so the
 * dual-cap size maths in menu.css keeps working untouched: thirteen tiles land
 * near 259px on a wide screen and shrink on a short one exactly as three do.
 *
 * Every tile opens on a single click. A real <button> already fires click on
 * both Enter and Space, so there is no keyboard handler here.
 */

import { el, icon, reduceMotion } from './util.js';
import * as router from './router.js';

let data = null;
let host = null;
let titleNode = null;
let ctaNode = null;
let level = { kind: 'root' };
/* The wall is built before the start screen lets go. Playing the entrance on
   render would run it under an opaque overlay — which is exactly the bug that
   was fixed once already and that this rewrite reintroduced. Nothing animates
   until the caller says the menu is actually on screen. */
let revealed = false;

/* ── data helpers ─────────────────────────────────────────────────────── */
const projectsIn = (folderId) =>
  data.projects.filter((p) => p.folder === folderId && !p.hidden && p.status !== 'missing');

const channelProjects = (c) => (c.folders || []).flatMap(projectsIn);

const channels = () => data.channels || [];
const channelById = (id) => channels().find((c) => c.id === id);

/* What the hover bubble says: the lab names at the root, the blurb one level
   down, so the tile is never just a name you have to guess at. */
function captionForChannel(c) {
  const ps = channelProjects(c);
  if (!ps.length) return c.blurb || '';
  const featured = ps.filter((p) => p.featured);
  const pick = (featured.length ? featured : ps).slice(0, 5).map((p) => p.title || p.id);
  const rest = ps.length - pick.length;
  return pick.join(' · ') + (rest > 0 ? `  +${rest} more` : '');
}

/* ── one card ─────────────────────────────────────────────────────────────
 * Circle, then a text column: name, what it is, and the stack it is built on.
 * The old "Open" pill is gone — it was hover-only so it never appeared on a
 * touch screen, it said nothing a <button> does not already announce, and it
 * cost 21px of height in a card that was overflowing by 8. */
function tile({ id, iconId, label, sub, chips, caption, route }) {
  const slot = el('div', 'slot');

  const btn = el('button', 'chan');
  btn.type = 'button';
  btn.dataset.card = id;
  btn.dataset.route = route;

  const art = el('span', 'chan__art');
  art.appendChild(icon(iconId));
  btn.appendChild(art);

  const text = el('span', 'chan__text');
  text.appendChild(el('span', 'chan__label', label));
  if (sub) text.appendChild(el('span', 'chan__count', sub));
  /* Always appended, even with nothing in it. The text block is vertically
     centred, so a card missing this row centres its name 11px lower than its
     neighbours' — which on a wall of three reads as one card being slightly
     wrong rather than as a missing chip. */
  const row = el('span', 'chan__chips');
  /* decoration: the stack is already in the panel, and read aloud after the
     name it is four more nouns before you learn what the thing does */
  row.setAttribute('aria-hidden', 'true');
  (chips || []).forEach((c) => row.appendChild(el('span', 'chan__chip', c)));
  text.appendChild(row);
  btn.appendChild(text);

  slot.appendChild(btn);

  if (caption) {
    /* a sibling of the button, not a child — a child would scale with the
       tile's hover transform */
    const bub = el('span', 'bubble', caption);
    bub.setAttribute('aria-hidden', 'true');   /* duplicates the label */
    slot.appendChild(bub);
  }
  return slot;
}

/* ── layout ───────────────────────────────────────────────────────────────
 * FEWER columns than before, because the card is wide now. Five across at the
 * old shape gave a 259px tile that was 195px tall and clipped its own text;
 * four across gives 330 x 137, which a horizontal card fills comfortably.
 * Thirteen lands as 4/4/4/1, and the orphan gets centred below. */
function shapeFor(n) {
  const cols = n <= 2 ? Math.max(1, n) : n <= 4 ? n : n <= 6 ? 3 : 4;
  /* Never zero. On the data-failed path the wall is empty, and --rows: 0 makes
     the height cap calc out to minus one gap — a negative max-height, which is
     an odd thing to hand a browser on the one path that is already broken. */
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

/* Centre a short final row. A translate rather than grid-column-start, because
   the offset is half a column whenever (cols - rest) is odd — thirteen cards
   four across leaves one, which wants shifting by exactly 1.5 columns and can
   only land on 1 or 2 as a grid line. Transform takes no part in layout, so
   nothing reflows and the FLIP zoom still reads the right rect. */
function centreLastRow(host, count, cols) {
  const rest = count % cols;
  if (!rest || rest === cols) return;
  const shift = (cols - rest) / 2;
  for (let i = count - rest; i < count; i++) {
    host.children[i]?.style.setProperty('--shift', String(shift));
  }
}

/* ── the pitch ────────────────────────────────────────────────────────────
 * What this is and why anyone should care, above the wall, on the screen a
 * hiring manager actually lands on. Three abstract tiles and an 11px name plate
 * made someone work out the answer for themselves, and nobody does.
 *
 * No month or year in here on purpose: publish.sh check 13 fails the build on a
 * forward-looking date that has quietly gone past, and "available now" cannot
 * expire. */
const PITCH_LEAD = 'Desktop Support / IT — available now';
const PITCH_SUB =
  'B.S. Cybersecurity, University at Albany. Thirteen labs and six builds, ' +
  'each one stood up, broken on purpose, and written up well enough to rebuild from.';

const folderLabel = (id) =>
  (data.folders || []).find((f) => f.id === id)?.label || '';

/* ── render a level ───────────────────────────────────────────────────── */
function render() {
  if (!host) return;
  host.textContent = '';

  let tiles = [];
  const sub = level.kind === 'channel';

  if (sub) {
    const c = channelById(level.id);
    const ps = channelProjects(c);
    tiles = ps.map((p) => tile({
      id: p.id,
      iconId: 'i-' + (p.icon || 'default'),
      label: p.title || p.id,
      /* WHAT IT IS, not what it is written in. The language was already on the
         chips; the folder is the thing a hiring manager is actually sorting by. */
      sub: folderLabel(p.folder),
      chips: (p.stack || []).slice(0, 3),
      caption: p.blurb || '',
      route: 'project/' + p.id,
    }));
  } else {
    tiles = channels().map((c) => {
      const n = channelProjects(c).length;
      return tile({
        id: c.id,
        iconId: 'i-' + (c.icon || 'default'),
        label: c.label,
        sub: c.kind || c.blurb || '',
        chips: n ? [`${n} ${n === 1 ? 'entry' : 'entries'}`] : [],
        caption: captionForChannel(c),
        route: c.id,
      });
    });
  }

  tiles.forEach((t) => host.appendChild(t));

  const { cols, rows } = shapeFor(tiles.length);
  host.style.setProperty('--cols', String(cols));
  host.style.setProperty('--rows', String(rows));
  centreLastRow(host, tiles.length, cols);

  /* One slot, two jobs: the pitch at the root, the channel's name inside it. */
  if (titleNode) {
    titleNode.textContent = '';
    if (sub) {
      titleNode.appendChild(el('span', 'level__lead', channelById(level.id).label));
    } else {
      titleNode.appendChild(el('span', 'level__lead', PITCH_LEAD));
      titleNode.appendChild(el('span', 'level__sub', PITCH_SUB));
    }
    titleNode.hidden = false;
  }
  /* The closing ask belongs on the screen that is the end of a visit, not
     halfway down a channel. */
  if (ctaNode) ctaNode.hidden = sub;

  document.body.classList.toggle('is-sub', sub);
  /* The Menu button is always in the dock; at the root there is simply nowhere
     to go back to. Disabling beats hiding — hiding re-centred the whole bar. */
  document.querySelectorAll('[data-menu-back]').forEach((b) => { b.disabled = !sub; });

  measureChrome();
  if (revealed) enter();
}

/* ── how much of the stage is NOT the wall ────────────────────────────────
 * The grid derives its own height from the viewport minus the header, the dock
 * and this. Measured rather than declared, because the pitch wraps to two lines
 * on a narrow window and a hardcoded token would under-count exactly when it
 * matters — pushing the bottom row under the dock, which is the failure this
 * whole change exists to stop. */
let lastChrome = null;

function measureChrome() {
  const stage = host && host.parentElement;
  if (!stage) return;
  const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
  let total = 0;
  for (const node of stage.children) {
    if (node === host || node.hidden) continue;
    /* Out-of-flow children take no space in the column, so counting them would
       be wrong — and .loading is `position:absolute; inset:0`, so counting it
       would charge the grid the ENTIRE stage height and collapse the wall to
       nothing on the one path where the data failed to load. */
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
    const h = node.getBoundingClientRect().height;
    if (h > 0) total += h + gap;
  }
  const px = `${Math.ceil(total)}px`;
  /* Only write on a real change: the value feeds the grid's own size, and
     re-setting it unconditionally from a ResizeObserver is how you get a
     layout loop that pegs a core. */
  if (px === lastChrome) return;
  lastChrome = px;
  document.documentElement.style.setProperty('--stage-chrome', px);
}

/* ── entrance ─────────────────────────────────────────────────────────── */
function enter() {
  if (!host || reduceMotion()) return;
  /* Read the token rather than hardcoding a delay, so the motion toggle that
     zeroes it actually stops the stagger. Deliberately not `|| 38`:
     parseFloat('0ms') is 0, and 0 || 38 would resurrect the very stagger the
     toggle just switched off. */
  const raw = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--stagger'));
  const step = Number.isFinite(raw) ? raw : 38;

  host.querySelectorAll('.chan').forEach((n, i) => {
    n.classList.add('chan--in');
    n.style.setProperty('--delay', `${i * step}ms`);
    n.addEventListener('animationend', () => {
      n.classList.remove('chan--in');
      n.style.removeProperty('--delay');
    }, { once: true });
  });
}

export function playEntrance() { revealed = true; enter(); }

/* ── what the router asks for ─────────────────────────────────────────── */
export function showRoot() {
  if (level.kind === 'root') return;
  level = { kind: 'root' };
  render();
}

export function showChannel(id) {
  const c = channelById(id);
  /* A channel with no folders — RÉSUMÉ — has nothing to be a menu OF, so it is
     not one. Returning false lets the router fall through to its panel. */
  if (!c || !channelProjects(c).length) return false;
  if (level.kind === 'channel' && level.id === id) return true;
  level = { kind: 'channel', id };
  render();
  return true;
}

export const currentLevel = () => level;

/* Focus a tile by id, AFTER a render. The panel's own focus restoration runs
   before the grid rebuilds, so anything it focused has already been thrown away
   by the time the new tiles exist — which is how closing a project left focus
   on <body>. */
export function focusTile(id) {
  const t = host && host.querySelector(`.chan[data-card="${CSS.escape(id)}"]`);
  if (t) { t.focus({ preventScroll: true }); return true; }
  return false;
}

export function init(payload) {
  data = payload;
  host = document.querySelector('[data-grid]');
  titleNode = document.querySelector('[data-level-title]');
  ctaNode = document.querySelector('[data-cta]');
  if (!host) return;

  level = { kind: 'root' };
  render();

  /* The pitch re-wraps when the window narrows and when the webfont lands, and
     both change how much height the wall has left. Observing beats a resize
     listener because the font swap is not a resize. */
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => measureChrome());
    for (const node of [titleNode, ctaNode]) if (node) ro.observe(node);
  }
  addEventListener('resize', measureChrome);

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.chan');
    if (!btn) return;
    e.preventDefault();
    const c = channelById(btn.dataset.card);
    if (c && c.href) { location.href = c.href; return; }
    router.go(btn.dataset.route, btn);
  });

  /* Back out of a sub-menu. One handler, because Escape, the dock button and
     the browser's own back all end up going through the router anyway. */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-menu-back]')) { e.preventDefault(); router.home(); }
  });
}
