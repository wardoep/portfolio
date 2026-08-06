/* carousel.js — three cards in a coverflow. Replaces the tile grid.
 *
 * The focused card sits centre, full size and opacity. The other two are scaled
 * down, faded, and tucked behind it. Arrows shuffle; it wraps, because with
 * three cards a dead end at either edge is just an annoyance.
 *
 * The rule that makes a coverflow feel right rather than fight you: clicking a
 * SIDE card centres it, it does not open it. Only the centre card opens. A
 * half-faded card behind the main one is still a click target, and without this
 * you trigger the wrong thing constantly.
 */

import { el, icon, reduceMotion, announce } from './util.js';
import * as router from './router.js';

let data = null;
let cards = [];
let index = 0;
let host = null;

const projectsIn = (folderId) =>
  data.projects.filter((p) => p.folder === folderId && !p.hidden && p.status !== 'missing');

const cardProjects = (card) =>
  (card.folders || []).flatMap(projectsIn);

/* Which lab names to show as the caption under the focused card (variant A). */
function captionFor(card) {
  const ps = cardProjects(card);
  if (!ps.length) return card.blurb || '';
  const featured = ps.filter((p) => p.featured);
  const pick = (featured.length ? featured : ps).slice(0, 5).map((p) => p.title || p.id);
  const rest = ps.length - pick.length;
  return pick.join(' · ') + (rest > 0 ? `  +${rest} more` : '');
}

/* ── build ─────────────────────────────────────────────────────────────── */
function build() {
  host.textContent = '';
  cards = [];

  const rail = el('div', 'coverflow__rail');
  rail.setAttribute('role', 'listbox');
  rail.setAttribute('aria-label', 'Sections');

  (data.carousel || []).forEach((c, i) => {
    const node = el('button', 'ccard');
    node.type = 'button';
    node.dataset.card = c.id;
    node.dataset.index = String(i);
    node.setAttribute('role', 'option');
    node.tabIndex = -1;

    const art = el('span', 'ccard__art');
    art.appendChild(icon('i-' + (c.icon || 'default')));
    node.appendChild(art);
    node.appendChild(el('span', 'ccard__label', c.label));

    const n = cardProjects(c).length;
    if (n) {
      node.appendChild(el('span', 'ccard__count', `${n} ${n === 1 ? 'project' : 'projects'}`));
    } else {
      node.appendChild(el('span', 'ccard__count', c.blurb || ''));
    }
    node.appendChild(el('span', 'ccard__go', 'Open'));

    rail.appendChild(node);
    cards.push({ spec: c, node });
  });

  host.appendChild(rail);

  /* the caption line: lab names under the focused card, so a skim-reader
     sees "Active Directory" without opening anything */
  const cap = el('p', 'coverflow__caption');
  cap.setAttribute('data-caption', '');
  host.appendChild(cap);


  focus(index, { silent: true });
}

/* ── focus a card ──────────────────────────────────────────────────────── */
export function focus(i, opts = {}) {
  if (!cards.length) return;
  const n = cards.length;
  index = ((i % n) + n) % n;                       // wrap both directions

  cards.forEach(({ node }, k) => {
    /* offset in the range -1 / 0 / +1 with wrapping, so the rail reads as a
       loop rather than a strip that runs out at either end */
    let d = k - index;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;

    node.classList.toggle('is-centre', d === 0);
    node.style.setProperty('--d', String(d));
    node.setAttribute('aria-selected', d === 0 ? 'true' : 'false');
    node.tabIndex = d === 0 ? 0 : -1;
    /* A faded side card is decoration, not a destination; keep it out of the
       tab order and off the screen reader's list of things to activate. */
    node.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
  });

  const cur = cards[index].spec;
  const cap = host.querySelector('[data-caption]');
  if (cap) cap.textContent = captionFor(cur);

  if (!opts.silent) {
    announce(`${cur.label}, ${index + 1} of ${n}`);
    if (opts.moveFocus !== false) cards[index].node.focus({ preventScroll: true });
  }
}

export const step = (delta) => focus(index + delta);

/* ── open the centre card ──────────────────────────────────────────────── */
function open(trigger) {
  const c = cards[index].spec;
  if (c.href) { location.href = c.href; return; }
  router.go(c.id, trigger || cards[index].node);
}

/* ── clock ─────────────────────────────────────────────────────────────── */
function startClock() {
  const node = document.querySelector('[data-clock]');
  if (!node) return;
  /* Intl with a named zone, never a fixed offset: it has to follow EDT/EST. */
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
  });
  const tick = () => { node.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 15_000);
}

/* ── entrance ──────────────────────────────────────────────────────────── */
function enter() {
  if (reduceMotion()) return;
  cards.forEach(({ node }, i) => {
    node.classList.add('ccard--in');
    node.style.setProperty('--delay', `${i * 70}ms`);
    node.addEventListener('animationend', () => {
      node.classList.remove('ccard--in');
      node.style.removeProperty('--delay');
    }, { once: true });
  });
}

export function init(payload) {
  data = payload;
  host = document.querySelector('[data-coverflow]');
  if (!host) return;

  /* PROJECTS is the centre card on load — it is why anyone is on the page. */
  const startAt = (data.carousel || []).findIndex((c) => c.id === 'projects');
  index = startAt >= 0 ? startAt : 0;

  build();
  startClock();
  enter();

  document.querySelector('[data-prev]')?.addEventListener('click', () => step(-1));
  document.querySelector('[data-next]')?.addEventListener('click', () => step(1));

  host.addEventListener('click', (e) => {
    const card = e.target.closest('.ccard');
    if (!card) return;
    e.preventDefault();
    const i = Number(card.dataset.index);
    if (i === index) open(card);            // centre card opens
    else focus(i);                          // side card only comes forward
  });

  document.addEventListener('keydown', (e) => {
    if (!e.target.closest?.('.ccard, [data-prev], [data-next]')) return;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); step(1); break;
      case 'ArrowLeft':  e.preventDefault(); step(-1); break;
      case 'Home':       e.preventDefault(); focus(0); break;
      case 'End':        e.preventDefault(); focus(cards.length - 1); break;
      case 'Enter':
      case ' ':          if (e.target.closest('.ccard')) { e.preventDefault(); open(e.target); } break;
      default: break;
    }
  });
}

export const currentCard = () => cards[index]?.spec || null;
