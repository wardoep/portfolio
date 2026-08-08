/* settings.js — the tint and motion toggles.
 *
 * The initial value is resolved by the inline script in <head>, before first
 * paint, so a reload never flashes green and then un-greens. This module only
 * handles changes the user makes afterwards.
 */

import { announce } from './util.js';

const root = document.documentElement;

/* Nothing in here notifies the background canvas. It watches data-theme and
   data-motion on <html> itself, which is the only way it stays correct for a
   caller that has not been written yet. See stars.js. */

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/* ── the theme, in one place ──────────────────────────────────────────────
 * The corner button is a TOGGLE, not a menu, and its icon shows what you are
 * switching TO — a moon while the site is light, a sun while it is dark. A
 * toggle that never renames itself is unusable with a screen reader, so the
 * label and aria-pressed move with the glyph.
 *
 * Everything that changes the theme goes through here, so there is one place
 * that knows how to leave the button telling the truth. */
function paintThemeButton() {
  const btn = document.querySelector('[data-toggle-theme-btn]');
  if (!btn) return;
  const dark = root.dataset.theme === 'dark';
  btn.setAttribute('aria-pressed', String(dark));
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.querySelector('[data-theme-icon]')?.setAttribute('href', dark ? '#i-sun' : '#i-moon');
}

function setTheme(dark, { remember = true } = {}) {
  root.dataset.theme = dark ? 'dark' : 'light';
  if (remember) write('pf-theme', dark ? 'dark' : 'light');
  paintThemeButton();
  /* stars.js watches data-theme on <html> itself, so the field re-inks without
     being told. See the note there about why that is not a callback. */
  announce(dark ? 'Dark mode on' : 'Light mode on');
}

export function init() {
  const motionBox = document.querySelector('[data-toggle-motion]');

  paintThemeButton();
  document.querySelector('[data-toggle-theme-btn]')
    ?.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark'));

  /* And watch the attribute itself, exactly as stars.js does. Anything that
     sets data-theme without going through setTheme — a devtools poke, a future
     caller, a test harness — would otherwise leave a moon on a black page,
     which is a button lying about what it will do. Observing is the only
     version of this that cannot be forgotten. */
  new MutationObserver(paintThemeButton).observe(root,
    { attributes: true, attributeFilter: ['data-theme'] });

  if (motionBox) {
    const systemOff = matchMedia('(prefers-reduced-motion: reduce)').matches;
    motionBox.checked = root.dataset.motion !== 'off' && !systemOff;
    if (systemOff) {
      motionBox.closest('.setting')?.querySelector('.setting__note')
        ?.append(' Your system is currently set to reduce motion.');
    }
    motionBox.addEventListener('change', () => {
      const on = motionBox.checked;
      if (on) delete root.dataset.motion; else root.dataset.motion = 'off';
      write('pf-motion', on ? 'on' : 'off');
      announce(on ? 'Animation on' : 'Animation off');
    });
  }

  /* With nothing stored, keep following the OS. Once the user picks, their
     choice is stored and this stops overriding it — remember:false so following
     the system does not silently become a stored preference. */
  if (read('pf-theme') === null) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (read('pf-theme') !== null) return;
      setTheme(e.matches, { remember: false });
    });
  }

}
