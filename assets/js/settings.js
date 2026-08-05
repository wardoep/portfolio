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

/* A live readout, because "is it 60?" is a question about the visitor's
   hardware and their display's refresh rate — not about mine. Measured over a
   rolling half-second so it settles instead of flickering. */
function fpsMeter() {
  const node = document.querySelector('[data-fps]');
  if (!node) return () => {};
  let raf = 0, frames = 0, t0 = 0, running = false;

  function tick(now) {
    if (!running) return;
    if (!t0) t0 = now;
    frames++;
    if (now - t0 >= 500) {
      const fps = Math.round((frames * 1000) / (now - t0));
      node.textContent = `${fps} FPS`;
      /* 55 rather than 60: a 60Hz display legitimately reports 58-59, and
         flagging that as a problem would be noise. */
      node.classList.toggle('is-low', fps > 0 && fps < 55);
      frames = 0; t0 = now;
    }
    raf = requestAnimationFrame(tick);
  }

  return (on) => {
    node.hidden = !on;
    if (on && !running) {
      running = true; frames = 0; t0 = 0;
      node.textContent = '– FPS';
      raf = requestAnimationFrame(tick);
    } else if (!on && running) {
      running = false; cancelAnimationFrame(raf);
    }
  };
}

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

  const fpsBox = document.querySelector('[data-toggle-fps]');
  if (fpsBox) {
    const setFps = fpsMeter();
    const stored = read('pf-fps') === 'on';
    fpsBox.checked = stored;
    setFps(stored);
    fpsBox.addEventListener('change', () => {
      setFps(fpsBox.checked);
      write('pf-fps', fpsBox.checked ? 'on' : 'off');
      announce(fpsBox.checked ? 'Frame-rate counter on' : 'Frame-rate counter off');
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
