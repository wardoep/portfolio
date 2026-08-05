/* router.js — hash routing, and the single source of truth for what is open.
 *
 * Hash and not the History API, because GitHub Pages has no rewrite rules:
 * /portfolio/project/soc-siem-lab would 404 on refresh and on every shared
 * link. #/project/soc-siem-lab needs no server support at all.
 *
 * Focus restoration lives HERE rather than in the click handler. That is the
 * bug almost everyone ships: the panel closes via the browser back button, no
 * click handler runs, and focus lands on <body>. Because the route is the only
 * thing that decides what is open, Escape, the scrim, the close button and the
 * back button all restore focus through this one path.
 */

const listeners = new Set();
let current = { name: 'home', arg: null };
let lastTrigger = null;   /* the element that opened whatever is open */

export function parse(hash) {
  const h = (hash || '').replace(/^#\/?/, '').trim();
  if (!h) return { name: 'home', arg: null };

  const [head, ...rest] = h.split('/');
  const arg = rest.join('/') || null;

  if (head === 'project' && arg) return { name: 'project', arg };
  if (head === 'folder' && arg) return { name: 'folder', arg };
  if (head === 'page' && arg) return { name: 'page', arg };
  if (['about', 'skills', 'resume', 'now', 'contact', 'settings', 'colophon'].includes(head)) {
    return { name: head, arg: null };
  }
  return { name: 'home', arg: null };
}

export const route = () => current;

/* Is a panel open? Everything except the bare menu counts. */
export const isPanelRoute = (r = current) =>
  !['home', 'page'].includes(r.name);

export function onRoute(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Remember what to focus when we come back. Set by whatever initiates a
   navigation; consumed once, on the way back to the menu. */
export function setTrigger(node) {
  lastTrigger = node || null;
}

export function takeTrigger() {
  const t = lastTrigger;
  lastTrigger = null;
  return t;
}

export function go(path, trigger) {
  if (trigger !== undefined) setTrigger(trigger);
  const next = path.startsWith('#') ? path : '#/' + String(path).replace(/^\/+/, '');
  if (location.hash === next) { emit(); return; }
  location.hash = next;
}

export function home(trigger) {
  if (trigger !== undefined) setTrigger(trigger);
  /* replaceState keeps the back button from filling up with open/close pairs
     when the user is just browsing panels. Note: hash only — passing a path
     here would navigate off the subpath entirely. */
  if (location.hash && location.hash !== '#/') {
    location.hash = '#/';
  } else {
    emit();
  }
}

function emit() {
  for (const fn of listeners) fn(current);
}

function handle() {
  current = parse(location.hash);
  emit();
}

export function start() {
  addEventListener('hashchange', handle);
  current = parse(location.hash);
  emit();
}
