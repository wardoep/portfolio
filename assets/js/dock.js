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
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
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
  setInterval(tick, 15_000);
}
