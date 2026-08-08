/* panels.js — opening, closing, focus trapping, and the project templates. */

import { el, icon, safeUrl, announce, copyText, asset, reduceMotion } from './util.js';
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

/* ── the channel opening ──────────────────────────────────────────────────
 * On the console this imitates, a channel does not fade in on top of the menu —
 * it grows out of its own tile and fills the screen. So: a FLIP. Measure the
 * tile, measure the panel, animate the difference away. Transform and opacity
 * only, so it never leaves the compositor.
 *
 * Uniform scale taken from the width. A separate Y scale distorts a panel full
 * of text badly enough to notice even at 400ms.
 *
 * ONE AUTHOR. This used to be a scripted animation plus a CSS `panelIn`
 * keyframe on .panel, with `.panel--zoom { animation: none !important }`
 * supposedly keeping them apart. It did not, at either end of the open:
 *
 *   - show() unhid the panel and then forced two style flushes before that
 *     class was added, so panelIn genuinely started at opacity 0;
 *   - and removing the class when the zoom FINISHED lifted `animation: none`
 *     and re-armed the keyframe, so the panel settled into place and then
 *     flashed and re-scaled from .96. Measured: opacity 1.00 -> 0.00,
 *     scale 1.00 -> 0.96, about 420ms after the click.
 *
 * That second one is the flicker. The fix is not to reorder two lines — it is
 * for .panel to have no CSS animation at all, so there is nothing to race. A
 * panel with no trigger to grow out of fades in place, through this same
 * function, so there is exactly one mechanism to reason about. */
let zoomedFrom = null;

function panelZoom(panel, rect, { reverse = false } = {}) {
  if (reduceMotion()) return null;
  const p = panel.getBoundingClientRect();
  if (!p.width) return null;

  const ms = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--d-slow')) || 0;
  if (!ms) return null;

  /* The panel's resting transform, read rather than assumed. It is
     translate(-50%, -50%) on desktop and `none` on a phone, where the panel is
     full-screen — hardcoding the desktop value put the mobile panel through a
     half-viewport jump on every open. */
  const base = getComputedStyle(panel).transform;
  const rest = base && base !== 'none' ? base : '';

  /* No trigger — a deep link, or a keyboard open with nothing on screen to grow
     out of. Fade up in place instead of skipping the animation entirely. */
  const from = (rect && rect.width)
    ? (() => {
        const s = Math.max(0.05, rect.width / p.width);
        const dx = (rect.left + rect.width / 2) - (p.left + p.width / 2);
        const dy = (rect.top + rect.height / 2) - (p.top + p.height / 2);
        /* The pixel offset goes FIRST: `rest` centres the panel by a percentage
           of its own box, so putting the offset after it would be scaled by s. */
        return `translate(${dx}px, ${dy}px) ${rest} scale(${s})`;
      })()
    : `${rest} scale(.96)`;

  const atTile = { transform: from, opacity: 0 };
  const atRest = { transform: `${rest} scale(1)`, opacity: 1 };

  panel.classList.add('panel--zoom');
  /* Promote for the duration only. The panel carries a 60px-blur shadow; on a
     promoted layer that is rasterised once and then transformed, instead of
     being repainted at every scale step. Left on permanently it would pin a
     full-size layer in memory for a panel that is usually closed. */
  panel.style.willChange = 'transform, opacity';
  const anim = panel.animate(reverse ? [atRest, atTile] : [atTile, atRest],
    { duration: ms, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: reverse ? 'forwards' : 'none' });
  const release = () => { panel.style.willChange = ''; };
  if (!reverse) anim.finished.then(() => {
    panel.classList.remove('panel--zoom');
    release();
  }).catch(release);
  else anim.finished.then(release).catch(release);
  return anim;
}

export function show(panel) {
  if (open === panel) return;
  /* animate:false — this is the hand-off between two panels, not a close, and
     an async exit here would leave the outgoing one on screen. */
  hide({ restoreFocus: false, animate: false });
  if (!panel) return;

  open = panel;
  scrim()?.removeAttribute('hidden');
  panel.hidden = false;
  setBackgroundInert(true);
  document.addEventListener('keydown', trap, true);

  /* peek, not take: the close path still needs the trigger for focus */
  const t = router.peekTrigger();
  zoomedFrom = (t && document.contains(t) && t.offsetParent !== null)
    ? t.getBoundingClientRect() : null;
  panelZoom(panel, zoomedFrom);

  /* Focus the panel itself, not the first link — so the heading is announced
     before the controls. */
  panel.focus({ preventScroll: true });
  const h = panel.querySelector('h2');
  if (h) announce(h.textContent.trim());
}

export function hide({ restoreFocus = true, animate = true } = {}) {
  closeLightbox();
  if (!open) return;
  const going = open;
  const back = zoomedFrom;
  zoomedFrom = null;

  open = null;
  scrim()?.setAttribute('hidden', '');
  setBackgroundInert(false);
  document.removeEventListener('keydown', trap, true);

  /* Shrink back into the tile it came from, then hide. `open` is already null,
     so a second close, a route change or Escape during the exit all no-op
     rather than racing this. */
  const exit = animate ? panelZoom(going, back, { reverse: true }) : null;
  if (exit) {
    exit.finished.then(() => {
      going.hidden = true;
      going.classList.remove('panel--zoom');
      exit.cancel();
    }).catch(() => { going.hidden = true; going.classList.remove('panel--zoom'); });
  } else {
    going.hidden = true;
    going.classList.remove('panel--zoom');
  }

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

/* ── evidence ─────────────────────────────────────────────────────────────
 * A portfolio of GitHub links shows nothing. Every panel used to end in an
 * outbound link, so a visitor read three paragraphs claiming there was a
 * working ticket queue and never saw one.
 *
 * The gallery is dormant until images exist: a project with no `shots` renders
 * no heading, no container, no empty frame. Adding evidence later is dropping a
 * file in assets/img/shots/ and one line in the data. */
function monthYear(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function buildGallery(p) {
  const shots = (p.shots || []).filter((s) => s && s.src && s.alt);
  if (!shots.length) return null;

  const grid = el('div', 'shots');
  shots.forEach((s, i) => {
    const fig = el('figure', 'shot');
    const btn = el('button', 'shot__open');
    btn.type = 'button';
    btn.dataset.shot = `${p.id}:${i}`;
    /* the alt text IS the caption, so a screen reader gets the same sentence a
       sighted visitor reads under the image — never "screenshot 1 of 4" */
    btn.setAttribute('aria-label', `View larger: ${s.alt}`);

    const img = el('img');
    img.src = asset('assets/img/shots/' + s.src);
    img.alt = s.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    if (s.w) img.width = s.w;
    if (s.h) img.height = s.h;
    btn.appendChild(img);

    fig.appendChild(btn);
    if (s.caption) fig.appendChild(el('figcaption', null, s.caption));
    grid.appendChild(fig);
  });
  return grid;
}

/* One lightbox for the whole site, built once. It is a sibling of the panels
   rather than a child, so the panel's own focus trap never fights it. */
let lightbox = null;
let lightboxReturn = null;

function openLightbox(img, caption, trigger) {
  if (!lightbox) {
    lightbox = el('div', 'lightbox');
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Screenshot');
    lightbox.hidden = true;
    lightbox.innerHTML = '';

    const figure = el('figure', 'lightbox__figure');
    const big = el('img', 'lightbox__img');
    const cap = el('figcaption', 'lightbox__cap');
    figure.append(big, cap);

    const close = el('button', 'lightbox__close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.append('Close');

    lightbox.append(figure, close);
    document.body.appendChild(lightbox);

    close.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    /* Escape and Tab both stop here — with one control there is nowhere else
       for focus to go, so the trap is simply "keep it on Close". */
    lightbox.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLightbox(); }
      else if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
    });
  }
  lightbox.querySelector('.lightbox__img').src = img.currentSrc || img.src;
  lightbox.querySelector('.lightbox__img').alt = img.alt;
  lightbox.querySelector('.lightbox__cap').textContent = caption || img.alt;
  lightbox.hidden = false;
  /* The trigger is passed in, not read from document.activeElement. A click
     does not necessarily leave focus on the button — a programmatic one never
     does — and reading it here silently returned focus to <body> on close. */
  lightboxReturn = trigger || null;
  lightbox.querySelector('.lightbox__close').focus();
}

function closeLightbox() {
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  if (lightboxReturn && document.contains(lightboxReturn) && lightboxReturn.offsetParent !== null) {
    lightboxReturn.focus({ preventScroll: true });
  }
  lightboxReturn = null;
}

export const isLightboxOpen = () => !!lightbox && !lightbox.hidden;

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

  /* The result, as a number. Several labs promise one in their own copy — the
     hardening lab literally says "so the improvement is a number and not a
     claim" — and then the number appeared nowhere on the site. */
  if (p.metric) {
    const m = el('p', 'metric');
    m.appendChild(el('strong', 'metric__value', p.metric.value));
    m.appendChild(el('span', 'metric__label', p.metric.label));
    body.appendChild(m);
  }

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

  const gallery = buildGallery(p);
  if (gallery) {
    body.appendChild(el('h3', null, 'What it looks like'));
    body.appendChild(gallery);
  }

  /* Recency was already in the data and rendered nowhere, so a lab built last
     month was indistinguishable from three-year-old coursework. */
  const updated = monthYear(p.gh && p.gh.pushedAt);
  if (updated) body.appendChild(el('p', 'stamp', `Updated ${updated}`));

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

/* Closing goes UP one level, not all the way home. A project was opened from
   its channel's menu, and dropping the visitor back at the root loses their
   place — the thing that made the overlay feel like a dead end in the first
   place. Anything not opened from a menu has no parent but home. */
function closeToParent() {
  const r = router.route();
  if (r.name === 'project' && lastCard) router.go(lastCard);
  else router.home();
}

/* ── route -> panel ───────────────────────────────────────────────────── */
function panelForRoute(r) {
  if (r.name === 'project') {
    const p = data.projects.find((x) => x.id === r.arg
      || (x.renamedFrom || []).includes(r.arg));
    return p ? buildProject(p) : null;
  }
  /* 'menu' never reaches here — a channel swaps the stage rather than opening
     a panel, and the router handler below sends it to the grid instead. */
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
    if (e.target.closest('[data-close]')) { e.preventDefault(); closeToParent(); }
    else if (e.target === scrim()) closeToParent();
    const opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); router.go(opener.dataset.open, opener); }
    /* Scoped to .panel, not to a wrapper class. This listened on
       '.folder-grid [data-route]' for three commits — a class that exists
       nowhere in the repo — so every one of the twenty labs was a dead end.
       Inside a panel, [data-route] means exactly one thing: a row. Nothing on
       the menu carries it, which is what makes the bare attribute safe here. */
    const inner = e.target.closest('.panel [data-route]');
    if (inner) { e.preventDefault(); router.go(inner.dataset.route, inner); }
    const shot = e.target.closest('[data-shot]');
    if (shot) {
      e.preventDefault();
      openLightbox(shot.querySelector('img'),
        shot.closest('.shot')?.querySelector('figcaption')?.textContent, shot);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isLightboxOpen()) { e.preventDefault(); closeLightbox(); return; }
    if (open) { e.preventDefault(); closeToParent(); }
  });

  router.onRoute((r) => {
    /* Remember which channel a project was reached through, so closing it can
       put focus back on that tile rather than on <body>. */
    if (r.name === 'menu') lastCard = r.arg;
    if (!router.isPanelRoute(r)) { hide(); return; }
    const p = panelForRoute(r);
    if (p) show(p);
    else router.home();
  });
}
