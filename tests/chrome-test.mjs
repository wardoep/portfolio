/* chrome-test.mjs — the furniture: the face, the toggle, the bar, the clock.
 *
 * Small claims, all of them things that look right in a screenshot taken at the
 * wrong second and are one measurement away from certain.
 */
import { connect, reporter } from './cdp.mjs';

const { ev, wait, load, count, errors } = await connect({ width: 1440, height: 900 });
const { check, done } = reporter();

await load();
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | ').slice(0, 160));

/* ── one face ──────────────────────────────────────────────────────────── */
console.log('\nTHE FACE');
{
  /* Every piece of text on the page, not just the labels. The one exception is
     resume.html, checked at the end — that page is what goes on applications,
     gets printed and gets parsed by tracking systems, and a bitmap monospace
     makes all three worse. */
  const SAMPLES = [
    ['body', 'body'],
    ['name chip', '.user__name'],
    ['card title', '.chan__label'],
    ['clock', '.clock'],
    ['dock label', '.dock__label'],
  ];
  for (const [what, sel] of SAMPLES) {
    const f = await ev(`(() => { const el = document.querySelector('${sel}');
      return el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/"/g, '') : 'MISSING'; })()`);
    check(`${what} is the pixel face`, f === 'Departure Mono', f);
  }

  /* Fractional font sizes smear a bitmap face. Now that it is the whole site's
     body text, an integer size is not tidiness — it is legibility. */
  const frac = await ev(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.textContent.trim() || el.children.length) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (Math.abs(px - Math.round(px)) > 0.01) bad.push((el.className || el.tagName) + ' ' + px);
    }
    return JSON.stringify([...new Set(bad)].slice(0, 5));
  })()`);
  check('no visible text lands on a fractional pixel size',
    JSON.parse(frac).length === 0, JSON.parse(frac).join(', '));

  /* The descriptor lives one level down now, not on the root cards. Checked
     there rather than dropped, or the pixel face could quietly stop applying
     to the only text on the projects wall. */
  await load('#/projects');
  check('card descriptor is the pixel face, one level down',
    (await ev(`getComputedStyle(document.querySelector('.chan__count'))
       .fontFamily.split(',')[0].replace(/"/g, '')`)) === 'Departure Mono');
  await load();
}

/* ── the theme toggle ──────────────────────────────────────────────────── */
console.log('\nTHE SUN AND THE MOON');
{
  const read = () => ev(`(() => {
    const b = document.querySelector('[data-toggle-theme-btn]');
    return JSON.stringify({
      theme: document.documentElement.dataset.theme,
      icon: b.querySelector('[data-theme-icon]').getAttribute('href'),
      pressed: b.getAttribute('aria-pressed'),
      label: b.getAttribute('aria-label'),
      opensPanel: b.hasAttribute('data-open'),
    });
  })()`);

  await ev(`document.documentElement.dataset.theme = 'light';
            document.querySelector('[data-toggle-theme-btn]').click();`);
  await wait(200);
  let s = JSON.parse(await read());
  check('clicking it in light mode goes dark', s.theme === 'dark', s.theme);
  /* The icon shows what you are switching TO. */
  check('and the icon becomes a sun', s.icon === '#i-sun', s.icon);
  check('aria-pressed follows the state', s.pressed === 'true', s.pressed);
  check('and the label renames itself', /light/i.test(s.label), s.label);

  await ev(`document.querySelector('[data-toggle-theme-btn]').click()`);
  await wait(200);
  s = JSON.parse(await read());
  check('clicking again goes back to light', s.theme === 'light', s.theme);
  check('and the icon becomes a moon', s.icon === '#i-moon', s.icon);
  check('it toggles rather than opening a panel', !s.opensPanel);
  check('no panel opened', (await ev(`document.querySelector('.panel:not([hidden])')?.id || 'none'`)) === 'none');

  /* Set the attribute WITHOUT clicking, the way the screenshot harness and a
     devtools poke both do. The button used to repaint only on its own click, so
     it sat showing a moon on a black page — a control lying about what it will
     do. It observes data-theme now, like the star field. */
  await ev(`document.documentElement.dataset.theme = 'dark'`);
  await wait(150);
  s = JSON.parse(await read());
  check('the icon follows the theme even when nothing clicked it',
    s.icon === '#i-sun' && s.pressed === 'true', `${s.icon}, pressed ${s.pressed}`);
  await ev(`document.documentElement.dataset.theme = 'light'`);
  await wait(150);
  check('and back again',
    JSON.parse(await read()).icon === '#i-moon');

  /* The gear is still there, because the Display panel holds the animation
     switch and the legal line notes/LEGAL.md requires stay on the site. */
  check('the gear is still beside it and still opens Display',
    await ev(`document.querySelector('.cornerbtn[data-open="settings"]') !== null`));
  check('and the Display panel no longer carries a dark-mode row',
    await ev(`document.querySelector('[data-toggle-theme]') === null`));
  check('but it does still carry the legal line',
    await ev(`(document.querySelector('#p-settings .fineprint')?.textContent || '').length > 40`));
}

/* ── the bottom bar ────────────────────────────────────────────────────── */
console.log('\nTHE BOTTOM BAR');
{
  await load();
  const labels = JSON.parse(await ev(
    `JSON.stringify([...document.querySelectorAll('.dock__label')].map((n) => n.textContent.trim()))`));
  console.log(`     ${labels.join(' · ')}`);
  check('About is gone from the bar', !labels.includes('About'), labels.join(','));
  check('it still reaches About from the name chip',
    await ev(`document.querySelector('.user')?.dataset.open === 'about'`));
  check('the back button is named Back', labels[0] === 'Back', labels[0]);
  check('and sits at the far left of the bar', await ev(`(() => {
    const b = document.querySelector('.dock__btn--back').getBoundingClientRect();
    const d = document.querySelector('.dock').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.dock')).paddingLeft);
    return Math.abs(b.left - (d.left + pad)) <= 2;
  })()`), await ev(`(() => {
    const b = document.querySelector('.dock__btn--back').getBoundingClientRect();
    const d = document.querySelector('.dock').getBoundingClientRect();
    return 'back at ' + Math.round(b.left) + ', bar at ' + Math.round(d.left); })()`));
  check('it is disabled at the root', await ev(`document.querySelector('.dock__btn--back').disabled`));
}

/* ── the clock ─────────────────────────────────────────────────────────── */
console.log('\nTHE CLOCK');
{
  const first = await ev(`document.querySelector('.clock').textContent`);
  check('it shows seconds', /^\d{2}:\d{2}:\d{2}$/.test(first), first);
  await wait(2200);
  const second = await ev(`document.querySelector('.clock').textContent`);
  check('and it is actually ticking', first !== second, `${first} -> ${second}`);
  /* The clock centres the whole bar, so digits that change width would shove
     everything sideways once a second. */
  check('the digits are tabular so the bar cannot shift',
    (await ev(`getComputedStyle(document.querySelector('.clock')).fontVariantNumeric`)).includes('tabular-nums'));
}

/* ── the quiet home screen ─────────────────────────────────────────────── */
console.log('\nTHE HOME SCREEN');
{
  await load();
  check('no pitch above the wall', await ev(`document.querySelector('.level').hidden`));
  check('and no stray text where it was',
    (await ev(`document.querySelector('.level').textContent.trim()`)) === '');
  /* Name only, centred. No descriptor line, no chips, nothing under the wall. */
  check('the root cards carry only their name',
    (await ev(`JSON.stringify([...document.querySelectorAll('.chan')]
      .map((c) => c.innerText.trim()))`)) === '["PROJECTS","BUILDS","RÉSUMÉ"]',
    await ev(`JSON.stringify([...document.querySelectorAll('.chan')].map((c) => c.innerText.trim()))`));
  check('and centre it rather than hugging the left',
    await ev(`getComputedStyle(document.querySelector('.chan')).justifyContent === 'center'`));
  /* The closing ask is gone by request. Asserted as ABSENT rather than just
     deleted from the suite: leaving no check at all would let it drift back in
     unnoticed, and the whole point of removing it was that the home screen is
     three cards and nothing else. */
  check('nothing else sits under the wall',
    await ev(`document.querySelector('[data-cta]') === null`));
  check('and no email address is on the home screen',
    !(await ev(`document.body.innerText`)).includes('@gmail.com'));
  /* Contact is still one click away in the bar — removing the ask must not
     remove the way to reach him. */
  check('Contact is still in the dock',
    await ev(`[...document.querySelectorAll('.dock__label')]
      .some((n) => n.textContent.trim() === 'Contact')`));
  check('three cards', (await count('.chan')) === 3, String(await count('.chan')));

  /* Inside a channel the same slot names the channel. */
  await load('#/projects');
  check('a channel still names itself',
    (await ev(`document.querySelector('.level').textContent.trim()`)) === 'PROJECTS');
  check('and the back button is live there',
    (await ev(`document.querySelector('.dock__btn--back').disabled`)) === false);
}

/* ── the one deliberate exception ──────────────────────────────────────── */
console.log('\nTHE RESUME KEEPS ITS FACE');
{
  /* NOT '../resume.html' — BASE already ends in /portfolio/, so that resolves
     above the mount point and fetches a 404 page, whose UA default face is
     Times New Roman. The gate passed for the wrong reason and would have gone
     on passing if the résumé HAD been converted. */
  await load('resume.html');
  const f = await ev(`getComputedStyle(document.body).fontFamily`);
  check('resume.html is NOT set in the pixel face', !/Departure/.test(f), f.slice(0, 60));
  check('it is a system stack, so it prints and parses',
    /system|Segoe|Helvetica|Arial|sans-serif/i.test(f), f.slice(0, 60));
}

done('the face, the toggle, the bar and the clock all behave.');
