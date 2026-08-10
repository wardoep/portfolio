/* site.js — entry point. Loads the data, wires the modules, runs the boot gate. */

import { asset, announce } from './util.js';
import * as router from './router.js';
import * as grid from './grid.js';
import * as dock from './dock.js';
import * as panels from './panels.js';
import * as settings from './settings.js';
import * as stars from './stars.js';

/* ── boot gate ────────────────────────────────────────────────────────────
 * A real <button> filling the viewport, not a div with a click handler. It is
 * an overlay on top of the finished page rather than the initial DOM, so a
 * scraper, a reader mode, or a failed script all still find the content.
 *
 * Skipped outright when the URL carries a route: a shared deep link must not
 * put a black gate in front of the thing it points at. */
function bootGate(onDone) {
  const boot = document.querySelector('[data-boot]');
  const finish = () => { if (onDone) onDone(); };
  if (!boot) { finish(); return; }

  const seen = (() => { try { return sessionStorage.getItem('pf-booted') === '1'; } catch { return false; } })();
  const deepLink = location.hash && location.hash !== '#/' && location.hash !== '#';

  if (seen || deepLink) { boot.hidden = true; finish(); return; }

  /* No auto-dismiss. It held for 1.8s at one point, which I added because the
     screen is a wall in front of the content — but a screen that says PRESS A
     TO CONTINUE while letting itself out is incoherent, and a deep link still
     skips it entirely, which is the case that actually mattered. */
  const dismiss = () => {
    if (boot.hidden || boot.classList.contains('is-going')) return;
    try { sessionStorage.setItem('pf-booted', '1'); } catch { /* private mode */ }
    boot.classList.add('is-going');
    const done = () => {
      boot.hidden = true;
      document.querySelector('.user')?.focus({ preventScroll: true });
      announce('Menu ready');
      /* Only now is the menu actually visible, so this is when its entrance is
         worth playing. Running it under an opaque overlay meant the nicest
         animation on the site was invisible on the one visit that matters. */
      finish();
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
  /* Before the fetch, and outside the try — the clock is dock furniture and the
     background is the page's own background; neither may be hostage to whether
     projects.json arrives. */
  dock.init();
  stars.init();
  let menuVisible = false;
  const revealed = () => { menuVisible = true; grid.playEntrance(); };
  bootGate(revealed);

  const loading = document.querySelector('[data-loading]');

  let data;
  try {
    data = await loadData();
  } catch (err) {
    /* The static panels are already in the document, so the site still works —
       only the generated tiles are missing. Say so rather than spinning. */
    console.error(err);
    if (loading) loading.textContent = 'Channels unavailable — use the dock below.';
    /* Still draw the empty grid: a console shell with no channels is a more
       honest failure state than a blank rectangle. */
    grid.init({ projects: [], folders: [], channels: [] });
    panels.init({ projects: [], folders: [], channels: [] });
    router.start();
    return;
  }

  if (loading) loading.hidden = true;

  grid.init(data);
  /* If the gate already let go while the data was still in flight, the
     entrance had nothing to play; play it now. */
  if (menuVisible) grid.playEntrance();
  panels.init(data);

  /* The stage follows the route: a channel swaps the wall, anything else
     leaves it at the root behind whatever panel is open. A channel with no
     projects — RÉSUMÉ — reports back that it is not a menu, and the hash is
     rewritten so its panel opens instead of leaving a dead route. */
  let cameFrom = null;
  router.onRoute((r) => {
    if (r.name === 'menu') {
      if (!grid.showChannel(r.arg)) grid.showRoot();
      /* put focus back on the tile that was opened, once it exists again */
      if (cameFrom) { grid.focusTile(cameFrom); cameFrom = null; }
    } else if (r.name === 'project') {
      cameFrom = r.arg;          /* remember where to land on the way back */
    } else {
      grid.showRoot();
    }
  });

  /* ── the editor ─────────────────────────────────────────────────────────
   * Lazy in two senses: the module is only fetched when the route is hit, AND
   * only if the local write endpoint answers first. A visitor on penna.lol
   * never downloads a byte of it, and there is no editor there to find. */
  let admin = null;
  const adminHost = document.querySelector('[data-admin-host]');
  const localBase = location.href.split('#')[0];
  router.onRoute(async (r) => {
    if (r.name !== 'admin') { admin?.unmount(); return; }
    if (!adminHost) return;
    try {
      const probe = await fetch(new URL('__admin/ping', localBase).href, { cache: 'no-store' });
      if (!probe.ok) throw new Error('no local editor');
    } catch {
      /* On the published site this is the normal case, not an error worth
         showing. Typing the word simply does nothing there. */
      router.home();
      return;
    }
    if (!admin) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = asset('assets/css/admin.css');
      document.head.appendChild(link);
      admin = await import(asset('assets/js/admin.js'));
    }
    admin.mount(adminHost);
  });

  /* Type the word anywhere on the menu. Ignored while a field has focus, so it
     cannot fire while you are typing into the editor it opens. */
  let typed = '';
  addEventListener('keydown', (e) => {
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    typed = (typed + e.key.toLowerCase()).slice(-5);
    if (typed === 'admin') { typed = ''; router.go('admin'); }
  });

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
    /* same callback, so replaying the start screen also replays the menu
       arriving behind it — otherwise the second run is silent */
    bootGate(revealed);
  });


}

main();
