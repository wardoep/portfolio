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

/* ── one tile ─────────────────────────────────────────────────────────── */
function tile({ id, iconId, label, sub, caption, route }) {
  const slot = el('div', 'slot');

  const btn = el('button', 'chan');
  btn.type = 'button';
  btn.dataset.card = id;
  btn.dataset.route = route;

  const art = el('span', 'chan__art');
  art.appendChild(icon(iconId));
  btn.appendChild(art);
  btn.appendChild(el('span', 'chan__label', label));
  if (sub) btn.appendChild(el('span', 'chan__count', sub));

  /* Hover decoration. The button already announces as a button, so "Open" read
     aloud after the name is a second word for the same thing. */
  const go = el('span', 'chan__go', 'Open');
  go.setAttribute('aria-hidden', 'true');
  btn.appendChild(go);

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
 * Wide-ish rows rather than one long line: five across reads as a wall, ten
 * across reads as a strip and shrinks every tile to nothing. */
function shapeFor(n) {
  const cols = n <= 4 ? Math.max(1, n) : n <= 6 ? 3 : n <= 9 ? 3 : n <= 12 ? 4 : 5;
  return { cols, rows: Math.ceil(n / cols) };
}

/* ── render a level ───────────────────────────────────────────────────── */
function render() {
  if (!host) return;
  host.textContent = '';

  let tiles = [];
  let title = '';

  if (level.kind === 'channel') {
    const c = channelById(level.id);
    const ps = channelProjects(c);
    title = c.label;
    tiles = ps.map((p) => tile({
      id: p.id,
      iconId: 'i-' + (p.icon || 'default'),
      label: p.title || p.id,
      sub: (p.stack && p.stack[0]) || (p.gh && p.gh.language) || '',
      caption: p.blurb || '',
      route: 'project/' + p.id,
    }));
  } else {
    tiles = channels().map((c) => tile({
      id: c.id,
      iconId: 'i-' + (c.icon || 'default'),
      label: c.label,
      sub: (() => {
        const n = channelProjects(c).length;
        return n ? `${n} ${n === 1 ? 'project' : 'projects'}` : (c.blurb || '');
      })(),
      caption: captionForChannel(c),
      route: c.id,
    }));
  }

  tiles.forEach((t) => host.appendChild(t));

  const { cols, rows } = shapeFor(tiles.length);
  host.style.setProperty('--cols', String(cols));
  host.style.setProperty('--rows', String(rows));

  /* the level's name, and whether there is anywhere to go back to */
  if (titleNode) {
    titleNode.textContent = title;
    titleNode.hidden = !title;
  }
  document.body.classList.toggle('is-sub', level.kind === 'channel');

  if (revealed) enter();
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
  if (!host) return;

  level = { kind: 'root' };
  render();

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
