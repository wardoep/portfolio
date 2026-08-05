/* grid-nav.js — roving tabindex and arrow-key movement across the tile grid.
 *
 * role="grid" is a promise: it tells a screen-reader user the layout has a
 * shape, and it obliges you to make the arrow keys work. A grid without them is
 * worse than a plain list, so this file is not optional decoration.
 *
 * Exactly one tile is tabbable at a time, so the whole grid is ONE tab stop —
 * five stops to cross the page instead of twenty-five.
 */

import { showPage, currentPage, totalPages } from './menu.js';

function gridOf(page) {
  return document.querySelectorAll('.page')[page]?.querySelector('.grid') || null;
}

function tilesOf(page) {
  const g = gridOf(page);
  return g ? [...g.querySelectorAll('[data-tile]')] : [];
}

function cols(page) {
  const g = gridOf(page);
  return g ? Number(g.getAttribute('aria-colcount')) || 5 : 5;
}

function focusAt(page, index, { moveTo } = {}) {
  const tiles = tilesOf(page);
  if (!tiles.length) return;
  const i = Math.max(0, Math.min(index, tiles.length - 1));
  tiles.forEach((t) => { t.tabIndex = -1; });
  tiles[i].tabIndex = 0;
  if (moveTo !== false) tiles[i].focus();
}

/* Make sure every page has exactly one tabbable tile, even before any
   interaction — otherwise the grid is unreachable by keyboard at all. */
export function seed() {
  document.querySelectorAll('.page').forEach((_, p) => {
    const tiles = tilesOf(p);
    if (!tiles.length) return;
    if (!tiles.some((t) => t.tabIndex === 0)) tiles[0].tabIndex = 0;
  });
}

export function init() {
  seed();

  document.addEventListener('keydown', (e) => {
    const tile = e.target.closest?.('[data-tile]');
    if (!tile) return;

    const page = currentPage();
    const tiles = tilesOf(page);
    const i = tiles.indexOf(tile);
    if (i < 0) return;

    const c = cols(page);
    const col = i % c;
    const row = Math.floor(i / c);
    const lastRow = Math.floor((tiles.length - 1) / c);

    const k = e.key;
    let next = null;

    if (k === 'ArrowRight') {
      if (col === c - 1 || i === tiles.length - 1) {
        /* At the right edge, turn the page and land in the mirrored column —
           the same row, first column, so the eye keeps its place. */
        if (page < totalPages() - 1) {
          e.preventDefault();
          showPage(page + 1);
          const t2 = tilesOf(page + 1);
          focusAt(page + 1, Math.min(row * cols(page + 1), t2.length - 1));
          return;
        }
      } else next = i + 1;
    } else if (k === 'ArrowLeft') {
      if (col === 0) {
        if (page > 0) {
          e.preventDefault();
          showPage(page - 1);
          const c2 = cols(page - 1);
          const t2 = tilesOf(page - 1);
          focusAt(page - 1, Math.min(row * c2 + (c2 - 1), t2.length - 1));
          return;
        }
      } else next = i - 1;
    } else if (k === 'ArrowDown') {
      next = row < lastRow ? Math.min(i + c, tiles.length - 1) : null;
    } else if (k === 'ArrowUp') {
      next = row > 0 ? i - c : null;
    } else if (k === 'Home') {
      next = e.ctrlKey ? 0 : row * c;
    } else if (k === 'End') {
      next = e.ctrlKey ? tiles.length - 1 : Math.min(row * c + c - 1, tiles.length - 1);
    } else if (k === 'PageDown') {
      if (page < totalPages() - 1) {
        e.preventDefault(); showPage(page + 1); focusAt(page + 1, 0); return;
      }
    } else if (k === 'PageUp') {
      if (page > 0) {
        e.preventDefault(); showPage(page - 1); focusAt(page - 1, 0); return;
      }
    } else {
      return;
    }

    if (next != null) {
      e.preventDefault();
      focusAt(page, next);
    }
  });

  /* Clicking or tabbing to a tile makes it the one the arrows continue from. */
  document.addEventListener('focusin', (e) => {
    const tile = e.target.closest?.('[data-tile]');
    if (!tile) return;
    const page = currentPage();
    const tiles = tilesOf(page);
    const i = tiles.indexOf(tile);
    if (i >= 0) focusAt(page, i, { moveTo: false });
  });
}
