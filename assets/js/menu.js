/* menu.js — builds the tile grid, runs the pager, the clock and the entrance. */

import { el, icon, reduceMotion, announce } from './util.js';
import * as router from './router.js';

const CATEGORY = { security: 'security', infra: 'infra', builds: 'builds' };

/* Channels that are not repos. Kept here rather than in the data file because
   they are part of the interface, not part of the portfolio content. */
const CHANNELS = {
  about:    { label: 'About',     icon: 'i-person',  cat: 'self',  blurb: 'Who I am and where I have worked.' },
  skills:   { label: 'Skills',    icon: 'i-sliders', cat: 'self',  blurb: 'What I actually use, not what I have read about.' },
  resume:   { label: 'Résumé',    icon: 'i-doc',     cat: 'self',  blurb: 'Plain, printable, ATS-safe.' },
  now:      { label: 'Now',       icon: 'i-spark',   cat: 'self',  blurb: 'What I am studying right now.', badge: '1' },
  contact:  { label: 'Contact',   icon: 'i-chat',    cat: 'self',  blurb: 'Email, GitHub, LinkedIn.' },
};

const LINKS = {
  github:   { label: 'GitHub',   icon: 'i-github',   cat: 'link', href: 'https://github.com/wardoep',
              blurb: 'Eighteen public repositories.' },
  linkedin: { label: 'LinkedIn', icon: 'i-linkedin', cat: 'link',
              href: 'https://www.linkedin.com/in/edward-penna-469096245',
              blurb: 'Formal history and recommendations.' },
};

let data = null;
let pageIndex = 0;
let pageCount = 1;
let track = null;

const projectById = (id) => data.projects.find((p) => p.id === id) || null;
const folderById  = (id) => data.folders.find((f) => f.id === id) || null;

function columns() {
  const w = innerWidth;
  return w <= 600 ? 2 : w <= 900 ? 3 : 5;
}

/* ── one tile ─────────────────────────────────────────────────────────── */
const projectsIn = (folderId) =>
  data.projects.filter((p) => p.folder === folderId && !p.hidden && p.status !== 'missing');

function tileFor(spec) {
  let node, label, iconId, cat, blurb, badge = null, external = false, pinned = false;
  let folderKids = null;

  if (spec.type === 'project') {
    const p = projectById(spec.id);
    if (!p || p.hidden || p.status === 'missing') return null;
    label = p.title || p.id;
    iconId = 'i-' + (p.icon || 'default');
    cat = CATEGORY[p.folder] || 'self';
    blurb = p.blurb;
    pinned = !!p.featured;
    node = el('button', 'tile tile--project');
    node.type = 'button';
    node.dataset.route = 'project/' + p.id;
  } else if (spec.type === 'folder') {
    const f = folderById(spec.id);
    if (!f) return null;
    label = f.label;
    iconId = 'i-' + (f.icon || 'box');
    cat = CATEGORY[f.id] || 'self';
    blurb = f.blurb;
    node = el('button', 'tile tile--folder');
    node.type = 'button';
    node.dataset.route = 'folder/' + f.id;
    /* Folders are now the only route to fifteen of the twenty projects, so the
       tile has to advertise that it contains things: a 2x2 preview of what is
       inside, and a count. Without this a folder looks like any other tile. */
    folderKids = projectsIn(f.id);
  } else if (spec.type === 'channel') {
    const c = CHANNELS[spec.id];
    if (!c) return null;
    label = c.label; iconId = c.icon; cat = c.cat; blurb = c.blurb; badge = c.badge || null;
    node = el('button', 'tile tile--channel');
    node.type = 'button';
    node.dataset.route = spec.id;
  } else if (spec.type === 'link') {
    const l = LINKS[spec.id];
    if (!l) return null;
    label = l.label; iconId = l.icon; cat = l.cat; blurb = l.blurb; external = true;
    node = el('a', 'tile tile--link');
    node.href = l.href;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  } else {
    return null;
  }

  node.dataset.cat = cat;
  node.dataset.tile = '';
  node.tabIndex = -1;

  const art = el('span', 'tile__art');
  if (folderKids) {
    /* four mini icons in a 2x2, the way a console folder shows its contents */
    art.classList.add('tile__art--folder');
    folderKids.slice(0, 4).forEach((p) => {
      const cellIcon = icon('i-' + (p.icon || 'default'));
      cellIcon.classList.add('mini');
      art.appendChild(cellIcon);
    });
  } else {
    art.appendChild(icon(iconId));
  }
  node.appendChild(art);
  node.appendChild(el('span', 'tile__label', label));

  if (folderKids) {
    const n = el('span', 'tile__count', String(folderKids.length));
    n.setAttribute('aria-hidden', 'true');
    node.appendChild(n);
    node.append(el('span', 'sr-only', `, folder, ${folderKids.length} projects`));
  }

  if (pinned) {
    const pin = el('span', 'tile__pin');
    pin.appendChild(icon('i-pin'));
    pin.title = 'Also in its folder';
    node.appendChild(pin);
  }
  if (external) {
    const ext = el('span', 'tile__ext');
    ext.appendChild(icon('i-external'));
    node.appendChild(ext);
    node.append(el('span', 'sr-only', ' (opens in a new tab)'));
  }
  if (badge) {
    const b = el('span', 'user__badge', badge);
    b.setAttribute('aria-hidden', 'true');
    node.appendChild(b);
  }
  if (!external) node.appendChild(el('span', 'tile__start', 'Start'));

  const cell = el('div', 'cell');
  cell.setAttribute('role', 'gridcell');
  cell.appendChild(node);
  if (blurb) {
    const bub = el('span', 'bubble', blurb);
    bub.setAttribute('aria-hidden', 'true');   /* duplicates the label; do not read twice */
    cell.appendChild(bub);
  }
  return cell;
}

/* ── pages ────────────────────────────────────────────────────────────── */
export function render() {
  const host = document.querySelector('[data-pages]');
  if (!host || !data) return;

  const cols = columns();
  host.textContent = '';
  track = el('div', 'page-track');

  const pages = data.layout || [];
  pageCount = pages.length;

  pages.forEach((pg, pi) => {
    const page = el('div', 'page');
    page.dataset.page = String(pg.page);

    const grid = el('div', 'grid');
    grid.style.setProperty('--rows', String(Math.ceil(pg.tiles.length / cols)));
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', `Channels, page ${pi + 1} of ${pages.length}: ${pg.label}`);

    const cells = pg.tiles.map(tileFor).filter(Boolean);
    const rows = Math.ceil(cells.length / cols);
    grid.setAttribute('aria-rowcount', String(rows));
    grid.setAttribute('aria-colcount', String(cols));

    for (let r = 0; r < rows; r++) {
      const row = el('div', 'row');
      row.setAttribute('role', 'row');
      cells.slice(r * cols, r * cols + cols).forEach((c) => row.appendChild(c));
      grid.appendChild(row);
    }
    page.appendChild(grid);
    track.appendChild(page);
  });

  host.appendChild(track);
  showPage(Math.min(pageIndex, pageCount - 1), { silent: true });
  enter();
}

function enter() {
  if (reduceMotion()) return;
  /* Only the page you can actually see. Staggering all 30 tiles meant the last
     one waited 1.1s and half the animations ran off-screen for nothing. */
  const page = track.children[pageIndex];
  if (!page) return;
  const tiles = page.querySelectorAll('[data-tile]');
  const step = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--stagger')) || 38;
  tiles.forEach((t, i) => {
    t.classList.add('tile--in');
    t.style.setProperty('--delay', `${i * step}ms`);
    t.addEventListener('animationend', () => {
      t.classList.remove('tile--in');
      t.style.removeProperty('--delay');
    }, { once: true });
  });
}

export function showPage(i, opts = {}) {
  if (!track) return;
  pageIndex = Math.max(0, Math.min(i, pageCount - 1));
  track.style.transform = `translateX(-${pageIndex * 100}%)`;

  const dots = document.querySelector('.dots');
  if (dots) dots.hidden = pageCount < 2;

  document.querySelectorAll('.dot').forEach((d, di) => {
    const on = di === pageIndex;
    d.classList.toggle('is-on', on);
    if (on) d.setAttribute('aria-current', 'page');
    else d.removeAttribute('aria-current');
  });

  const prev = document.querySelector('[data-page-prev]');
  const next = document.querySelector('[data-page-next]');
  if (prev) prev.hidden = pageIndex === 0;
  if (next) next.hidden = pageIndex >= pageCount - 1;

  if (!opts.silent) {
    const label = (data.layout[pageIndex] || {}).label || '';
    announce(`Page ${pageIndex + 1} of ${pageCount}, ${label}`);
  }
}

export const currentPage = () => pageIndex;
export const totalPages = () => pageCount;

/* ── clock ────────────────────────────────────────────────────────────── */
function startClock() {
  const node = document.querySelector('[data-clock]');
  if (!node) return;
  /* Intl with a named zone, never a fixed -5: it has to follow EDT/EST. */
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
  });
  const tick = () => { node.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 15_000);
}

export function init(payload) {
  data = payload;
  render();
  startClock();

  document.querySelector('[data-page-next]')?.addEventListener('click', () => showPage(pageIndex + 1));
  document.querySelector('[data-page-prev]')?.addEventListener('click', () => showPage(pageIndex - 1));
  document.querySelectorAll('.dot').forEach((d, i) => d.addEventListener('click', () => showPage(i)));

  /* Column count changes with the viewport, and the rows are real elements in
     the accessibility tree, so the grid has to be rebuilt rather than reflowed. */
  let cols = columns();
  let t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const next = columns();
      if (next !== cols) { cols = next; render(); }
    }, 180);
  });

  /* One delegated handler for every tile that routes. */
  document.querySelector('[data-pages]')?.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-tile]');
    if (!tile || !tile.dataset.route) return;
    e.preventDefault();
    router.go(tile.dataset.route, tile);
  });
}

export function data_() { return data; }
