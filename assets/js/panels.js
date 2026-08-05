/* panels.js — opening, closing, focus trapping, and the project templates. */

import { el, icon, safeUrl, announce, copyText } from './util.js';
import * as router from './router.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

let data = null;
let open = null;          /* the open <section class="panel"> */
let dynamicHost = null;

const scrim = () => document.querySelector('[data-scrim]');

/* ── background inertness ─────────────────────────────────────────────── */
function setBackgroundInert(on) {
  const roots = [
    document.querySelector('.hud'),
    document.querySelector('.stage'),
    document.querySelector('.dock'),
  ];
  for (const r of roots) {
    if (!r) continue;
    if (on) { r.inert = true; r.setAttribute('aria-hidden', 'true'); }
    else { r.inert = false; r.removeAttribute('aria-hidden'); }
  }
}

function trap(e) {
  if (e.key !== 'Tab' || !open) return;
  const items = [...open.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function show(panel) {
  if (open === panel) return;
  hide({ restoreFocus: false });
  if (!panel) return;

  open = panel;
  scrim()?.removeAttribute('hidden');
  panel.hidden = false;
  setBackgroundInert(true);
  document.addEventListener('keydown', trap, true);

  /* Focus the panel itself, not the first link — so the heading is announced
     before the controls. */
  panel.focus({ preventScroll: true });
  const h = panel.querySelector('h2');
  if (h) announce(h.textContent.trim());
}

export function hide({ restoreFocus = true } = {}) {
  if (!open) return;
  open.hidden = true;
  open = null;
  scrim()?.setAttribute('hidden', '');
  setBackgroundInert(false);
  document.removeEventListener('keydown', trap, true);

  if (restoreFocus) {
    const t = router.takeTrigger();
    if (t && document.contains(t)) t.focus({ preventScroll: true });
  }
}

/* ── project panel ────────────────────────────────────────────────────── */
function buildProject(p) {
  const id = 'p-project-' + p.id;
  let panel = document.getElementById(id);
  if (panel) return panel;

  panel = el('section', 'panel');
  panel.id = id;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', id + '-h');
  panel.tabIndex = -1;
  panel.hidden = true;

  const bar = el('div', 'panel__bar');
  const h2 = el('h2');
  h2.id = id + '-h';
  h2.appendChild(icon('i-' + (p.icon || 'default')));
  h2.append(p.title || p.id);
  if (p.title) h2.appendChild(el('span', 'panel__slug', p.id));
  bar.appendChild(h2);
  const x = el('button', 'panel__x');
  x.type = 'button';
  x.setAttribute('data-close', '');
  x.setAttribute('aria-label', 'Close');
  x.appendChild(icon('i-close'));
  bar.appendChild(x);
  panel.appendChild(bar);

  const body = el('div', 'panel__body prose');

  if (p.blurb) body.appendChild(el('p', 'lead', p.blurb));

  const stack = (p.stack && p.stack.length) ? p.stack : [];
  if (stack.length) {
    const ul = el('ul', 'meta');
    stack.forEach((s) => ul.appendChild(el('li', null, s)));
    body.appendChild(ul);
  } else if (p.gh && p.gh.language) {
    const ul = el('ul', 'meta');
    ul.appendChild(el('li', null, p.gh.language));
    body.appendChild(ul);
  }

  if (p.note) body.appendChild(el('p', 'note', p.note));

  if (p.gh && p.gh.description) {
    body.appendChild(el('h3', null, 'What it is'));
    body.appendChild(el('p', null, p.gh.description));
  }

  if (p.highlights && p.highlights.length) {
    body.appendChild(el('h3', null, 'What it covers'));
    const ul = el('ul', 'beats');
    p.highlights.forEach((t) => ul.appendChild(el('li', null, t)));
    body.appendChild(ul);
  }

  const url = safeUrl(p.gh && p.gh.url);
  if (url) {
    const row = el('p', 'cta-row');
    const a = el('a', 'btn btn--primary');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(p.linkLabel || 'View on GitHub');
    a.appendChild(icon('i-external'));
    row.appendChild(a);

    const home = safeUrl(p.gh && p.gh.homepageUrl);
    if (home) {
      const b = el('a', 'btn');
      b.href = home; b.target = '_blank'; b.rel = 'noopener noreferrer';
      b.append('Live');
      b.appendChild(icon('i-external'));
      row.appendChild(b);
    }
    body.appendChild(row);
  }

  panel.appendChild(body);
  dynamicHost.appendChild(panel);
  return panel;
}

/* ── folder overlay ───────────────────────────────────────────────────── */
function buildFolder(f) {
  const id = 'p-folder-' + f.id;
  let panel = document.getElementById(id);
  if (panel) return panel;

  panel = el('section', 'panel');
  panel.id = id;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', id + '-h');
  panel.tabIndex = -1;
  panel.hidden = true;

  const bar = el('div', 'panel__bar');
  const h2 = el('h2');
  h2.id = id + '-h';
  h2.appendChild(icon('i-' + (f.icon || 'box')));
  h2.append(f.label);
  bar.appendChild(h2);
  const x = el('button', 'panel__x');
  x.type = 'button';
  x.setAttribute('data-close', '');
  x.setAttribute('aria-label', 'Close');
  x.appendChild(icon('i-close'));
  bar.appendChild(x);
  panel.appendChild(bar);

  const body = el('div', 'panel__body');
  if (f.blurb) {
    const p = el('p', 'lead', f.blurb);
    p.style.marginBottom = '18px';
    body.appendChild(p);
  }

  const grid = el('div', 'folder-grid');
  data.projects
    .filter((p) => p.folder === f.id && !p.hidden && p.status !== 'missing')
    .forEach((p) => {
      const b = el('button', 'tile tile--project');
      b.type = 'button';
      b.dataset.cat = f.id;
      b.dataset.route = 'project/' + p.id;
      b.dataset.tile = '';
      const art = el('span', 'tile__art');
      art.appendChild(icon('i-' + (p.icon || 'default')));
      b.appendChild(art);
      b.appendChild(el('span', 'tile__label', p.title || p.id));
      b.appendChild(el('span', 'tile__start', 'Start'));
      grid.appendChild(b);
    });
  body.appendChild(grid);
  panel.appendChild(body);
  dynamicHost.appendChild(panel);
  return panel;
}

/* ── contact copy ─────────────────────────────────────────────────────── */
function wireCopy() {
  const btn = document.querySelector('[data-copy-email]');
  if (!btn) return;
  const value = document.querySelector('[data-email]')?.textContent.trim() || '';
  const hint = btn.querySelector('[data-copy-text]');
  const original = hint ? hint.textContent : '';
  btn.addEventListener('click', async () => {
    const ok = await copyText(value);
    btn.classList.toggle('is-copied', ok);
    if (hint) hint.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    announce(ok ? 'Email address copied' : 'Copy failed — select and copy manually');
    setTimeout(() => {
      btn.classList.remove('is-copied');
      if (hint) hint.textContent = original;
    }, 2000);
  });
}

/* ── route -> panel ───────────────────────────────────────────────────── */
function panelForRoute(r) {
  if (r.name === 'project') {
    const p = data.projects.find((x) => x.id === r.arg
      || (x.renamedFrom || []).includes(r.arg));
    return p ? buildProject(p) : null;
  }
  if (r.name === 'folder') {
    const f = data.folders.find((x) => x.id === r.arg);
    return f ? buildFolder(f) : null;
  }
  const stat = document.getElementById('p-' + r.name);
  return stat || null;
}

export function init(payload) {
  data = payload;
  dynamicHost = document.querySelector('[data-dynamic-panels]');
  wireCopy();

  /* Close: every route back to the menu goes through the router, so this one
     handler covers the button, the scrim, Escape and the back button. */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { e.preventDefault(); router.home(); }
    else if (e.target === scrim()) router.home();
    const opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); router.go(opener.dataset.open, opener); }
    const inner = e.target.closest('.folder-grid [data-route]');
    if (inner) { e.preventDefault(); router.go(inner.dataset.route, inner); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); router.home(); }
  });

  router.onRoute((r) => {
    if (!router.isPanelRoute(r)) { hide(); return; }
    const p = panelForRoute(r);
    if (p) show(p);
    else router.home();
  });
}
