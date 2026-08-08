/* dock.js — the clock and date in the bottom bar.
 *
 * This lived inside the menu module, and it was called AFTER that module's
 * `if (!host) return` guard. So the clock was silently coupled to the home
 * screen rendering: no menu container, no clock. It is dock furniture, and the
 * dock is in the document whether or not the data ever arrives — which is
 * exactly when a stopped clock reading `--:--` looks most broken.
 */

/* Intl with a named zone, never a fixed offset: it has to follow EDT/EST. */
const TIME = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false, timeZone: 'America/New_York',
});
/* the reference shows a date under the clock — "Sun 5/27" */
const DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'America/New_York',
});

export function init() {
  const time = document.querySelector('[data-clock]');
  const date = document.querySelector('[data-date]');
  if (!time && !date) return;

  const tick = () => {
    const now = new Date();
    if (time) time.textContent = TIME.format(now);
    if (date) date.textContent = DATE.format(now).replace(',', '');
  };
  tick();
  /* Seconds, so it has to be a one-second tick. The clock is the element that
     centres the whole bottom bar, so it is also the one place where digits
     changing width would shove everything sideways twice a second — hence
     `font-variant-numeric: tabular-nums` on .clock, which is now load-bearing
     rather than tidy.
     Aligned to the next whole second first, so it does not sit visibly half a
     beat behind the system clock for the life of the page. */
  setTimeout(() => { tick(); setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
}
