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

export function init() {
  const themeBox = document.querySelector('[data-toggle-theme]');
  const motionBox = document.querySelector('[data-toggle-motion]');

  if (themeBox) {
    themeBox.checked = root.dataset.theme === 'dark';
    themeBox.addEventListener('change', () => {
      const dark = themeBox.checked;
      root.dataset.theme = dark ? 'dark' : 'light';
      write('pf-theme', dark ? 'dark' : 'light');
      announce(dark ? 'Dark mode on' : 'Light mode on');
    });
  }

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
     choice is stored and this stops overriding it. */
  if (read('pf-theme') === null) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (e) => {
      if (read('pf-theme') !== null) return;
      root.dataset.theme = e.matches ? 'dark' : 'light';
      if (themeBox) themeBox.checked = e.matches;
    });
  }

}
