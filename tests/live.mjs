/* live.mjs — run the checks against the deployed site, not the local server.
 *
 *   node tests/live.mjs                       the live domain
 *   PF_LIVE=https://foo.vercel.app/ node ...  a preview deployment
 *
 * A CDN can serve stale assets from some edges for minutes after a push,
 * and it will happily hand you a NEW index.html with OLD css on the same load.
 * That produced a verification run where the start screen was current and the
 * stylesheet was two commits behind. So this reports what it actually got.
 */
import { connect, reporter } from './cdp.mjs';

const LIVE = process.env.PF_LIVE || 'https://penna.lol/';
const { send, ev, wait, errors } = await connect({ width: 1440, height: 900 });
const { check, done } = reporter();

const go = async (hash = '') => {
  await send('Page.navigate', { url: 'about:blank' });
  await wait(200);
  errors.length = 0;
  await send('Page.navigate', { url: LIVE + hash });
  await send('Page.reload', { ignoreCache: true });
  await wait(3200);
  await ev(`sessionStorage.setItem('pf-booted', '1')`);
};

await go();
await go();   /* second pass so the boot flag is honoured */

check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | ').slice(0, 160));

const one = async (label, expr, want) => {
  const got = await ev(expr);
  check(label, typeof want === 'function' ? want(got) : got === want, JSON.stringify(got));
};

await one('every word is the pixel face',
  `getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g,'')`, 'Departure Mono');
await one('dock labels too (buttons do not inherit font)',
  `getComputedStyle(document.querySelector('.dock__label')).fontFamily.split(',')[0].replace(/"/g,'')`,
  'Departure Mono');
await one('no pitch above the wall', `document.querySelector('.level').hidden`, true);
await one('the closing ask is gone', `document.querySelector('[data-cta]') === null`, true);
await one('no email address on the home screen',
  `document.body.innerText.includes('@gmail.com')`, false);
await one('the bar reads Back first, no About',
  `[...document.querySelectorAll('.dock__label')].map(n=>n.textContent.trim()).join(',')`,
  'Back,Skills,Contact,GitHub,LinkedIn');
await one('the clock has seconds',
  `document.querySelector('.clock').textContent`, (v) => /^\d{2}:\d{2}:\d{2}$/.test(v));
await one('the toggle is a toggle, not a panel opener',
  `document.querySelector('[data-toggle-theme-btn]')?.hasAttribute('data-open')`, false);
await one('and the gear is still beside it',
  `!!document.querySelector('.cornerbtn[data-open="settings"]')`, true);

/* the toggle actually toggles, and the icon follows */
await ev(`document.documentElement.dataset.theme='light';
          document.querySelector('[data-toggle-theme-btn]').click()`);
await wait(250);
await one('clicking it goes dark', `document.documentElement.dataset.theme`, 'dark');
await one('and the icon becomes a sun',
  `document.querySelector('[data-theme-icon]').getAttribute('href')`, '#i-sun');
/* and it follows an attribute set by something else */
await ev(`document.documentElement.dataset.theme='light'`);
await wait(250);
await one('the icon follows a theme change nothing clicked',
  `document.querySelector('[data-theme-icon]').getAttribute('href')`, '#i-moon');

await one('the clock is centred on screen', `(() => {
  const r = document.querySelector('.dock__clock').getBoundingClientRect();
  return Math.round(r.left + r.width / 2 - innerWidth / 2);
})()`, (v) => Math.abs(v) <= 2);

await one('nothing inside a card is clipped',
  `[...document.querySelectorAll('.chan')].every(c => c.scrollHeight <= c.clientHeight + 1)`, true);
await one('the star field is painting', `(() => {
  const c = document.querySelector('[data-stars]');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
  return false;
})()`, true);

/* the flicker, on the deployed build */
await go('#/projects');
const frames = JSON.parse(await ev(`(async () => {
  window.__css = [];
  document.addEventListener('animationstart', (e) => {
    if (e.target.classList?.contains('panel')) window.__css.push(e.animationName);
  }, true);
  document.querySelector('.chan').click();
  const seen = [];
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const p = document.querySelector('.panel:not([hidden])');
    if (p) seen.push(+getComputedStyle(p).opacity);
  }
  return JSON.stringify({ seen, css: window.__css });
})()`));
let dips = 0, peak = 0;
for (const o of frames.seen) { if (o < peak - 0.05) dips++; peak = Math.max(peak, o); }
check('the panel never dims back once it is up', dips === 0, `${dips} dips`);
check('and no CSS keyframe fights the zoom', frames.css.length === 0, frames.css.join(','));

done(`live at ${LIVE} and behaving.`);
