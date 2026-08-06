/* site.js — entry point. Loads the data, wires the modules, runs the boot gate. */

import { asset, announce } from './util.js';
import * as router from './router.js';
import * as carousel from './carousel.js';
import * as panels from './panels.js';
import * as settings from './settings.js';

/* ── boot gate ────────────────────────────────────────────────────────────
 * A real <button> filling the viewport, not a div with a click handler. It is
 * an overlay on top of the finished page rather than the initial DOM, so a
 * scraper, a reader mode, or a failed script all still find the content.
 *
 * Skipped outright when the URL carries a route: a shared deep link must not
 * put a black gate in front of the thing it points at. */
function bootGate() {
  const boot = document.querySelector('[data-boot]');
  if (!boot) return;

  const seen = (() => { try { return sessionStorage.getItem('pf-booted') === '1'; } catch { return false; } })();
  const deepLink = location.hash && location.hash !== '#/' && location.hash !== '#';

  if (seen || deepLink) { boot.hidden = true; return; }

  const dismiss = () => {
    if (boot.hidden || boot.classList.contains('is-going')) return;
    try { sessionStorage.setItem('pf-booted', '1'); } catch { /* private mode */ }
    boot.classList.add('is-going');
    const done = () => {
      boot.hidden = true;
      document.querySelector('.user')?.focus({ preventScroll: true });
      announce('Menu ready');
    };
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--d-slow')) || 0;
    if (ms > 0) setTimeout(done, ms); else done();
  };

  boot.addEventListener('click', dismiss);
  addEventListener('keydown', (e) => {
    if (boot.hidden) return;
    if (e.key === 'Tab') return;                 /* let Tab reach the button */
    dismiss();
  }, { once: false });

  boot.focus({ preventScroll: true });
}

async function loadData() {
  const res = await fetch(asset('data/projects.json'), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`projects.json: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  settings.init();
  bootGate();

  const loading = document.querySelector('[data-loading]');

  let data;
  try {
    data = await loadData();
  } catch (err) {
    /* The static panels are already in the document, so the site still works —
       only the generated tiles are missing. Say so rather than spinning. */
    console.error(err);
    if (loading) loading.textContent = 'Channels unavailable — use the dock below.';
    panels.init({ projects: [], folders: [], carousel: [] });
    router.start();
    return;
  }

  if (loading) loading.hidden = true;

  carousel.init(data);
  panels.init(data);
  router.start();

  /* Reboot returns to the start screen, which is the only thing on the page
     that is genuinely just for fun. */
  document.querySelector('[data-reboot]')?.addEventListener('click', () => {
    try { sessionStorage.removeItem('pf-booted'); } catch { /* private mode */ }
    const boot = document.querySelector('[data-boot]');
    if (!boot) return;
    router.home();
    boot.classList.remove('is-going');
    boot.hidden = false;
    boot.focus({ preventScroll: true });
    bootGate();
  });


}

main();
