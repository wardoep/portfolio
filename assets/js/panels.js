/* panels.js — opening, closing, focus trapping, and the project templates. */

import { el, icon, safeUrl, announce, copyText } from './util.js';
import * as router from './router.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

let data = null;
let open = null;          /* the open <section class="panel"> */
let dynamicHost = null;
/* which card overlay a project was reached through, so closing it can put
   focus back on that channel rather than on <body> */
let lastCard = 'projects';

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
    /* The trigger is often a row INSIDE a card panel, and show() hid that panel
       on the way in. Calling .focus() on a display:none element is a silent
       no-op that drops focus to <body>, so being in the document is not enough
       — it has to still be rendered. offsetParent is the same visibility test
       the focus trap uses above. */
    const usable = t && document.contains(t) && t.offsetParent !== null;
    const fallback = document.querySelector(`[data-card="${lastCard}"]`)
      || document.querySelector('[data-card]');
    (usable ? t : fallback)?.focus({ preventScroll: true });
  }
}

/* ── shared chrome ────────────────────────────────────────────────────────
 * Header carries a circular badge; the foot carries a wide Back bar. Both come
 * from the reference renders, and the foot replaces the corner X — closing had
 * no visible affordance, and an X has no console equivalent. */
function panelBar(id, iconId, title, slug, tint) {
  const bar = el('div', 'panel__bar');
  const badge = el('span', 'panel__badge');
  if (tint) badge.style.setProperty('--badge-tint', tint);
  badge.appendChild(icon(iconId));
  bar.appendChild(badge);
  const h2 = el('h2');
  h2.id = id + '-h';
  h2.append(title);
  if (slug) h2.appendChild(el('span', 'panel__slug', slug));
  bar.appendChild(h2);
  return bar;
}

function panelFoot(extra) {
  const foot = el('div', 'panel__foot');
  const back = el('button', 'panel__back');
  back.type = 'button';
  back.setAttribute('data-close', '');
  back.appendChild(icon('i-arrow-l'));
  back.append('Back');
  foot.appendChild(back);
  if (extra) foot.appendChild(extra);
  return foot;
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

  panel.appendChild(panelBar(id, 'i-' + (p.icon || 'default'), p.title || p.id, p.title ? p.id : null));

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

  panel.appendChild(body);

  /* the outbound action belongs in the foot beside Back, not buried in prose */
  const url = safeUrl(p.gh && p.gh.url);
  let action = null;
  if (url) {
    action = el('a', 'btn btn--primary');
    action.href = url;
    action.target = '_blank';
    action.rel = 'noopener noreferrer';
    action.append(p.linkLabel || 'View on GitHub');
    action.appendChild(icon('i-external'));
  }
  panel.appendChild(panelFoot(action));
  dynamicHost.appendChild(panel);
  return panel;
}

/* ── card overlay ─────────────────────────────────────────────────────────
 * A card can span several folders. PROJECTS covers thirteen labs, and thirteen
 * undifferentiated items is its own kind of unorganised — so each folder gets
 * its own labelled section inside the one overlay. */
function projectRow(p, cat) {
  const b = el('button', 'row-item');
  b.type = 'button';
  b.dataset.cat = cat;
  b.dataset.route = 'project/' + p.id;

  const badge = el('span', 'row-item__badge');
  badge.appendChild(icon('i-' + (p.icon || 'default')));
  b.appendChild(badge);

  const text = el('div', 'row-item__text');
  text.appendChild(el('span', 'row-item__name', p.title || p.id));
  /* the blurb is the reason rows beat the old icon grid — a grid had nowhere
     to put it, and it is what someone scanning thirteen labs actually reads */
  if (p.blurb) text.appendChild(el('span', 'row-item__blurb', p.blurb));
  b.appendChild(text);

  const go = el('span', 'row-item__go');
  go.appendChild(icon('i-arrow-r'));
  b.appendChild(go);
  return b;
}

function buildCard(card) {
  const id = 'p-card-' + card.id;
  let panel = document.getElementById(id);
  if (panel) return panel;

  panel = el('section', 'panel panel--wide');
  panel.id = id;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', id + '-h');
  panel.tabIndex = -1;
  panel.hidden = true;

  panel.appendChild(panelBar(id, 'i-' + (card.icon || 'box'), card.label, null,
                             `var(--card-${card.id})`));

  const body = el('div', 'panel__body');
  const folders = (card.folders || [])
    .map((fid) => data.folders.find((f) => f.id === fid))
    .filter(Boolean);

  folders.forEach((f) => {
    const items = data.projects
      .filter((p) => p.folder === f.id && !p.hidden && p.status !== 'missing');
    if (!items.length) return;

    const sec = el('section', 'group');
    if (folders.length > 1) {
      const head = el('div', 'group__head');
      head.appendChild(el('h3', 'group__name', f.label));
      head.appendChild(el('span', 'group__n', String(items.length)));
      sec.appendChild(head);
    }
    if (f.blurb) sec.appendChild(el('p', 'group__blurb', f.blurb));
    const rows = el('div', 'rows');
    items.forEach((p) => rows.appendChild(projectRow(p, f.id)));
    sec.appendChild(rows);
    body.appendChild(sec);
  });

  panel.appendChild(body);
  panel.appendChild(panelFoot());
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
  if (r.name === 'card') {
    const c = (data.channels || []).find((x) => x.id === r.arg);
    if (c) lastCard = c.id;
    return c ? buildCard(c) : null;
  }
  if (r.name === 'folder') {
    /* kept so an older shared link still resolves */
    const f = data.folders.find((x) => x.id === r.arg);
    return f ? buildCard({ id: f.id, label: f.label, icon: f.icon, folders: [f.id] }) : null;
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
    /* Scoped to .panel, not to a wrapper class. This listened on
       '.folder-grid [data-route]' for three commits — a class that exists
       nowhere in the repo — so every one of the twenty labs was a dead end.
       Inside a panel, [data-route] means exactly one thing: a row. Nothing on
       the menu carries it, which is what makes the bare attribute safe here. */
    const inner = e.target.closest('.panel [data-route]');
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
