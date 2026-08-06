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
