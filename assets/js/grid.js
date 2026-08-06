/* grid.js — the channel grid. Four across, three down.
 *
 * Three slots are filled and nine are empty, which is what the reference looks
 * like and what was asked for. The empty ones are not placeholders waiting on
 * content: they are part of the picture, so they are inert — no tab stop, no
 * pointer events, nothing announced.
 *
 * Every filled tile opens on a single click. The coverflow's centre-first rule
 * is gone with it, and so is the keyboard handler that rule needed: a real
 * <button> already fires click on both Enter and Space.
 */

import { el, icon, reduceMotion } from './util.js';
import * as router from './router.js';

const SLOTS = 12;                 /* 4 x 3 — one page of the reference menu */

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

function emptySlot() {
  const slot = el('div', 'slot slot--empty');
  slot.setAttribute('aria-hidden', 'true');
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

  /* Only the filled tiles. Popping nine grey sockets is noise. */
  host.querySelectorAll('.chan').forEach((n, i) => {
    n.classList.add('chan--in');
    n.style.setProperty('--delay', `${i * step}ms`);
    n.addEventListener('animationend', () => {
      n.classList.remove('chan--in');
      n.style.removeProperty('--delay');
    }, { once: true });
  });
}

export function init(data) {
  const host = document.querySelector('[data-grid]');
  if (!host) return;

  const channels = data.channels || [];
  host.textContent = '';

  channels.forEach((c) => host.appendChild(channelSlot(data, c)));
  for (let i = channels.length; i < SLOTS; i++) host.appendChild(emptySlot());

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.chan');
    if (!btn) return;
    e.preventDefault();
    const c = channels.find((x) => x.id === btn.dataset.card);
    if (c && c.href) { location.href = c.href; return; }
    router.go(btn.dataset.card, btn);
  });

  enter(host);
}
