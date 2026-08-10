/* util.js — small shared helpers. */

/* Everything on the page resolves against this. The site is served from a
   SUBPATH (/portfolio/), so a bare relative fetch works only by luck of there
   being one HTML file. Compute the base once and mean it. */
export const BASE = new URL('.', document.baseURI);

export const asset = (p) => new URL(p, BASE).href;

/* Parsed with NO base, deliberately. `new URL('undefined', location.href)`
   happily resolves to /undefined, so a missing field becomes a dead link that
   looks real. With no base, anything that isn't an absolute URL throws — which
   is what we want. */
export function safeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
}

/* Is this project meant to be on the public site at all?
 *
 * ONE definition, because there used to be two. The grid filtered on hidden and
 * status; the deep-link route did a bare find() and filtered on neither. So a
 * repo that went private vanished from the wall while #/project/<slug> still
 * built a full panel for it — description, dates and a "View on GitHub" button
 * pointing at a repository nobody could open. Anything that decides whether a
 * project is shown calls this. */
export const isPublished = (p) => !!p && !p.hidden && p.status !== 'missing';

export function text(el, value) {
  el.textContent = value == null ? '' : String(value);
  return el;
}

export function el(tag, className, textContent) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (textContent != null) n.textContent = String(textContent);
  return n;
}

export function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ico');
  /* The sprite is drawn in a 24-unit space. Without this, any icon rendered
     smaller than 24px is clipped to its top-left corner instead of scaled. */
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  /* Relative fragment only — never absolute. A <base> tag or an absolute href
     here would silently blank every icon in Chrome and Safari. */
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

const live = () => document.querySelector('[data-announce]');
export function announce(msg) {
  const n = live();
  if (!n) return;
  n.textContent = '';
  /* a beat, so a repeated string is still re-announced */
  setTimeout(() => { n.textContent = msg; }, 40);
}

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
export function reduceMotion() {
  return motionQuery.matches || document.documentElement.dataset.motion === 'off';
}

export async function copyText(value) {
  try {
    if (navigator.clipboard && isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* fall through */ }
  /* Non-secure contexts — a LAN IP in dev, for instance — have no async
     clipboard. This path is why the fallback exists at all. */
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
