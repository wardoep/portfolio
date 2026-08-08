/* measure.mjs — read the numbers the tokens are supposed to encode.
 *
 * --hud-h and --dock-h are subtracted by the grid to derive its own height, so
 * whenever the header or the bar changes shape those tokens have to be
 * re-derived from the browser rather than estimated. Getting that wrong clips
 * the bottom row in silence, which has happened twice.
 *
 *   node tests/measure.mjs
 */
import { connect } from './cdp.mjs';

const { ev, load, wait } = await connect({ width: 1440, height: 900 });
await load();
await wait(500);

console.log(await ev(`(() => {
  const cs = getComputedStyle(document.documentElement);
  const hud = document.querySelector('.hud');
  const dock = document.querySelector('.dock');
  const nat = (el) => {
    const prev = el.style.height, prevMin = el.style.minHeight;
    el.style.height = 'auto'; el.style.minHeight = '0';
    const h = el.getBoundingClientRect().height;
    el.style.height = prev; el.style.minHeight = prevMin;
    return Math.ceil(h);
  };
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'missing';
    const b = el.getBoundingClientRect();
    return Math.round(b.width) + 'x' + Math.round(b.height);
  };
  return [
    'token  --hud-h        ' + cs.getPropertyValue('--hud-h').trim(),
    'real   .hud natural   ' + nat(hud) + 'px',
    'token  --dock-h       ' + cs.getPropertyValue('--dock-h').trim(),
    'real   .dock natural  ' + nat(dock) + 'px',
    'chrome --stage-chrome ' + cs.getPropertyValue('--stage-chrome').trim(),
    '',
    'name chip   ' + r('.user'),
    'theme btn   ' + r('[data-toggle-theme-btn]'),
    'card        ' + r('.chan'),
    'clock text  ' + JSON.stringify(document.querySelector('.clock').textContent),
    'dock labels ' + [...document.querySelectorAll('.dock__label')].map((n) => n.textContent).join(' · '),
    'level shown ' + !document.querySelector('.level').hidden,
    '',
    'body font   ' + getComputedStyle(document.body).fontFamily,
    'card font   ' + getComputedStyle(document.querySelector('.chan__label')).fontFamily.split(',')[0],
    'prose font  ' + getComputedStyle(document.querySelector('#p-about p')).fontFamily.split(',')[0],
  ].join('\\n');
})()`));

process.exit(0);
