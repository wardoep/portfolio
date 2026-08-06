/* grid.js — the channel wall. One row, one tile per channel.
 *
 * It was a 4x3 of twelve with nine empty sockets. The empties were part of the
 * picture then; they are not wanted now, so they are not rendered — the grid
 * emits exactly as many slots as there are channels and the CSS lays out that
 * many columns. Nothing is hidden, because a hidden element is still a thing
 * the next person has to reason about.
 *
 * Every tile opens on a single click. The coverflow's centre-first rule went
 * with it, and so did the keyboard handler that rule needed: a real <button>
 * already fires click on both Enter and Space.
 */

import { el, icon, reduceMotion } from './util.js';
import * as router from './router.js';

const projectsIn = (data, folderId) =>
  data.projects.filter((p) => p.folder === folderId && !p.hidden && p.status !== 'missing');

const channelProjects = (data, c) =>
  (c.folders || []).flatMap((f) => projectsIn(data, f));

/* What the hover bubble says: the lab names, so a skim-reader sees "Active
   Directory" without opening anything. Falls back to the blurb for a channel
   that holds no projects. */
function captionFor(data, c) {
  const ps = channelProjects(data, c);
  if (!ps.length) return c.blurb || '';
  const featured = ps.filter((p) => p.featured);
  const pick = (featured.length ? featured : ps).slice(0, 5).map((p) => p.title || p.id);
  const rest = ps.length - pick.length;
  return pick.join(' · ') + (rest > 0 ? `  +${rest} more` : '');
}

function channelSlot(data, c) {
  const slot = el('div', 'slot');

  const btn = el('button', 'chan');
  btn.type = 'button';
  btn.dataset.card = c.id;

  const art = el('span', 'chan__art');
  art.appendChild(icon('i-' + (c.icon || 'default')));
  btn.appendChild(art);
  btn.appendChild(el('span', 'chan__label', c.label));

  const n = channelProjects(data, c).length;
  btn.appendChild(el('span', 'chan__count',
    n ? `${n} ${n === 1 ? 'project' : 'projects'}` : (c.blurb || '')));

  /* Hover decoration. The button already announces as a button, so "Open"
     read aloud after the name is just a second word for the same thing. */
  const go = el('span', 'chan__go', 'Open');
  go.setAttribute('aria-hidden', 'true');
  btn.appendChild(go);

  slot.appendChild(btn);

  /* A sibling of the button, not a child — a child would scale with the tile's
     hover transform. The CSS reveals it with the adjacent combinator. */
  const bub = el('span', 'bubble', captionFor(data, c));
  bub.setAttribute('aria-hidden', 'true');   /* duplicates the label */
  slot.appendChild(bub);

  return slot;
}

/* ── entrance ──────────────────────────────────────────────────────────── */
function enter(host) {
  if (reduceMotion()) return;
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

let gridHost = null;

/* Kept separate from init() so the caller decides WHEN it plays. It used to run
   the moment the grid was built, which was while the opaque start screen was
   still up. */
export function playEntrance() {
  if (gridHost) enter(gridHost);
}

export function init(data) {
  const host = document.querySelector('[data-grid]');
  if (!host) return;
  gridHost = host;

  const channels = data.channels || [];
  host.textContent = '';

  channels.forEach((c) => host.appendChild(channelSlot(data, c)));
  /* the column count follows the data, so adding a fourth channel needs no CSS */
  host.style.setProperty('--cols', String(Math.max(1, channels.length)));

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.chan');
    if (!btn) return;
    e.preventDefault();
    const c = channels.find((x) => x.id === btn.dataset.card);
    if (c && c.href) { location.href = c.href; return; }
    router.go(btn.dataset.card, btn);
  });
}
