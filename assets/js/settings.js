/* settings.js — the tint and motion toggles.
 *
 * The initial value is resolved by the inline script in <head>, before first
 * paint, so a reload never flashes green and then un-greens. This module only
 * handles changes the user makes afterwards.
 */

import { announce } from './util.js';

const root = document.documentElement;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function init() {
  const tintBox = document.querySelector('[data-toggle-tint]');
  const motionBox = document.querySelector('[data-toggle-motion]');

  if (tintBox) {
    tintBox.checked = root.dataset.tint !== 'off';
    tintBox.addEventListener('change', () => {
      const on = tintBox.checked;
      root.dataset.tint = on ? 'on' : 'off';
      write('pf-tint', on ? 'on' : 'off');
      announce(on ? 'Green tint on' : 'Green tint off');
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

  /* If nothing is stored, the tint default follows the viewport. Keep following
     it on resize until the user expresses a preference. */
  if (read('pf-tint') === null) {
    const mq = matchMedia('(min-width: 900px)');
    const sync = () => {
      if (read('pf-tint') !== null) return;
      root.dataset.tint = mq.matches ? 'on' : 'off';
      if (tintBox) tintBox.checked = mq.matches;
    };
    mq.addEventListener('change', sync);
  }
}
