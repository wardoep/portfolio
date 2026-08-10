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
  /* A channel is a MENU LEVEL, not an overlay: it swaps what the stage shows.
     Kept as its own route name so isPanelRoute can tell the difference. */
  if (head === 'projects' || head === 'builds') return { name: 'menu', arg: head };
  /* The editor. Not a panel and not a menu level — it takes the whole screen
     and only exists when the local write endpoint answers. */
  if (head === 'admin') return { name: 'admin', arg: null };
  if (['about', 'skills', 'resume', 'now', 'contact', 'settings'].includes(head)) {
    return { name: head, arg: null };
  }
  return { name: 'home', arg: null };
}

export const route = () => current;

/* Is a PANEL open? A menu level is not one — it is the stage showing something
   else, so treating it as a panel would inert the menu and raise a scrim behind
   its own tiles. */
export const isPanelRoute = (r = current) =>
  r.name !== 'home' && r.name !== 'menu' && r.name !== 'admin';

/* Is the stage showing a sub-menu rather than the root? */
export const isMenuRoute = (r = current) => r.name === 'menu';

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

/* Read it WITHOUT consuming it. The open animation needs to know which element
   was pressed so it can grow the panel out of it, and that happens long before
   the close path is entitled to claim the trigger for focus restoration. */
export const peekTrigger = () => lastTrigger;

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
