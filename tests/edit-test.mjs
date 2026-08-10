/* edit-test.mjs — the editing surface: layout, caret, cards, controls.
 *
 *   PF_BASE=http://127.0.0.1:8091/portfolio/ node tests/edit-test.mjs
 *
 * Every assertion in here started as a measurement of something that was
 * actually wrong, reported as "the bubble in the projects is overlaping the
 * other bubbles" and "type in the text bubbles easily and fluently". Both were
 * numbers, not opinions:
 *
 *   - 14 slots in a grid still sized --cols:4 --rows:4, i.e. for 13. Thirteen
 *     cards four across leaves one orphan, which centreLastRow shifts 1.5
 *     columns to centre — landing exactly on the + tile. One overlapping pair.
 *   - Clicking a paragraph selected 198 of its 198 characters, so the first
 *     keystroke deleted the paragraph.
 *
 * So they are asserted as numbers here, and the suite is the thing that says
 * whether it "looks nice" in the only sense a machine can check: nothing
 * overlaps, and typing does what typing does.
 */
import { connect, reporter } from './cdp.mjs';
import { readFileSync } from 'node:fs';

const PW = readFileSync(new URL('../.admin-pw', import.meta.url), 'utf8').trim();
const { ev, send, wait, load, viewport, count } = await connect({ width: 1440, height: 900 });
const { check, done } = reporter();

async function unlock() {
  await load('');
  await ev(`sessionStorage.removeItem('pf-admin-key'); localStorage.removeItem('pf-admin-vault')`);
  await load('#/admin');
  await wait(1200);
  await ev(`var f = document.querySelector('.alock');
            f.querySelector('input').value = ${JSON.stringify(PW)};
            f.requestSubmit();`);
  await wait(1500);
}

/* Rect intersection over every pair of slots. -1 on each edge so tiles that
   merely touch are not called an overlap. */
const OVERLAPS = `(function () {
  var s = [].slice.call(document.querySelectorAll('.slot'));
  var n = 0, first = '';
  for (var i = 0; i < s.length; i++) for (var j = i + 1; j < s.length; j++) {
    var a = s[i].getBoundingClientRect(), b = s[j].getBoundingClientRect();
    if (a.left < b.right - 1 && b.left < a.right - 1 &&
        a.top < b.bottom - 1 && b.top < a.bottom - 1) {
      n++; if (!first) first = '#' + i + ' vs #' + j;
    }
  }
  return n + (first ? ' (' + first + ')' : '');
})()`;

await unlock();

/* ── the wall, with the + on it ────────────────────────────────────────── */
console.log('\nNOTHING OVERLAPS');
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768]]) {
  await viewport(w, h);
  await ev(`location.hash = '#/projects'`);
  await wait(1200);
  const o = await ev(OVERLAPS);
  const slots = await count('.slot');
  const cols = (await ev(`getComputedStyle(document.querySelector('[data-grid]')).getPropertyValue('--cols')`)).trim();
  check(`${(w + 'x' + h).padEnd(10)} ${slots} slots, ${cols} across — no overlap`,
    o.startsWith('0'), o);
  /* The + must be counted BY the grid, not appended behind its back: that is
     what made every derived number one short. */
  check(`${(w + 'x' + h).padEnd(10)} the grid counts the + tile`,
    (await ev(`document.querySelectorAll('.ed-add').length`)) === 1);
}
await viewport(1440, 900);

/* ── typing ────────────────────────────────────────────────────────────── */
console.log('\nTYPING IS TYPING');
{
  await ev(`location.hash = '#/'`); await wait(900);
  await ev(`document.querySelector('.user').click()`); await wait(1100);

  const r = JSON.parse(await ev(`(function () {
    var p = document.querySelector('#p-about .ed-text');
    var before = p.textContent.length;
    var box = p.getBoundingClientRect();
    /* click near the middle of the first line, as a person would */
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + 60, clientY: box.top + 10 }));
    var sel = document.getSelection();
    return JSON.stringify({ before: before, selected: String(sel).length, collapsed: sel.isCollapsed });
  })()`));
  check('clicking selects nothing', r.selected === 0, `${r.selected} of ${r.before} characters selected`);
  check('and leaves a caret, not a selection', r.collapsed === true);

  /* The symptom itself: one keystroke into a long paragraph must leave it one
     character longer, not one character total. */
  const typed = JSON.parse(await ev(`(async function () {
    var p = document.querySelector('#p-about .ed-text');
    var before = p.textContent.length;
    document.execCommand('insertText', false, 'X');
    await new Promise(function (r) { setTimeout(r, 150); });
    return JSON.stringify({ before: before, after: p.textContent.length });
  })()`));
  check('typing one character adds one character',
    typed.after === typed.before + 1, `${typed.before} -> ${typed.after}`);

  /* Enter inside a paragraph is a line break, not a commit. */
  const stillOpen = await ev(`(function () {
    var p = document.querySelector('#p-about .ed-text.is-editing');
    if (!p) return 'not editing';
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return document.querySelector('#p-about .ed-text.is-editing') ? 'still editing' : 'closed';
  })()`);
  check('Enter does not close the box', stillOpen === 'still editing', stillOpen);

  await ev(`document.activeElement.blur()`); await wait(400);
}

/* ── card text ─────────────────────────────────────────────────────────── */
console.log('\nCARD TEXT IS CLICKABLE');
{
  await ev(`document.querySelector('[data-close]')?.click()`); await wait(700);
  check('the home cards expose their name as text',
    (await count('.chan .chan__label.ed-text')) === 3,
    String(await count('.chan .chan__label.ed-text')));

  await ev(`location.hash = '#/projects'`); await wait(1300);
  check('and so do the project cards',
    (await count('.chan .chan__label.ed-text')) >= 13,
    String(await count('.chan .chan__label.ed-text')));

  /* Clicking the card but NOT its words must still navigate, or you could not
     reach anything while editing. */
  const nav = await ev(`(async function () {
    var art = document.querySelector('.chan .chan__art');
    art.click();
    await new Promise(function (r) { setTimeout(r, 900); });
    return location.hash;
  })()`);
  check('clicking a card away from its words still navigates', nav.startsWith('#/project/'), nav);
  await ev(`location.hash = '#/projects'`); await wait(1000);
}

/* ── controls ──────────────────────────────────────────────────────────── */
console.log('\nCONTROLS ARE FINDABLE');
{
  await ev(`location.hash = '#/'`); await wait(900);
  await ev(`document.querySelector('.user').click()`); await wait(1100);

  check('there is an Add text control without hovering anything',
    (await count('#p-about .ed-addtext')) === 1);

  const pills = JSON.parse(await ev(`(async function () {
    var before = document.querySelectorAll('#p-about .cta-row .btn').length;
    var x = document.querySelector('#p-about .cta-row .ed-x');
    if (!x) return JSON.stringify({ before: before, after: before, had: false });
    x.click();
    await new Promise(function (r) { setTimeout(r, 500); });
    return JSON.stringify({
      before: before,
      after: document.querySelectorAll('#p-about .cta-row .btn').length,
      had: true,
    });
  })()`));
  check('each pill button carries its own delete', pills.had);
  check('and deleting one removes exactly one',
    pills.after === pills.before - 1, `${pills.before} -> ${pills.after}`);

  const added = JSON.parse(await ev(`(async function () {
    var before = document.querySelectorAll('#p-about .panel__body > *').length;
    document.querySelector('#p-about .ed-addtext').click();
    await new Promise(function (r) { setTimeout(r, 500); });
    return JSON.stringify({
      before: before,
      after: document.querySelectorAll('#p-about .panel__body > *').length,
    });
  })()`));
  check('Add text adds one block', added.after === added.before + 1,
    `${added.before} -> ${added.after}`);
}

/* ── the block toolbar actually fires ──────────────────────────────────── */
/* This section exists because the suite above passed while the ✕ on a text box
 * did nothing at all. The gap was precise: the PILL ✕ was asserted and works,
 * because it lives inside an <a>/<li> of a cta/links block, and those nodes are
 * never .ed-text. The BLOCK ✕ is a child of the paragraph itself, so
 * onClick's capture-phase `e.target.closest('.ed-text')` matched the paragraph,
 * stopPropagation() killed the event before the button's own listener, and
 * open() then stripped the toolbar. Measured: blocks 5 -> 5, confirm() called
 * zero times, the paragraph left is-editing.
 *
 * So the assertion is not "a block disappeared" — a naive delete-and-rerender
 * could fake that. It is: the handler RAN (confirm was asked), exactly one block
 * went, and the click did NOT fall through into edit mode instead. */
console.log('\nTHE BLOCK TOOLBAR FIRES');
{
  await ev(`location.hash = '#/'`); await wait(900);
  await ev(`document.querySelector('.user').click()`); await wait(1100);
  /* Auto-accept, so a blocked dialog cannot be mistaken for a working delete —
     and count the calls, which is what proves the handler was reached at all. */
  await ev(`window.__confirms = 0; window.confirm = function () { window.__confirms++; return true; };`);

  /* The toolbar is hover-revealed, so a real pointer has to be over the block
     before its buttons have a box to click. */
  const aim = async (label) => {
    const b = JSON.parse(await ev(`(function () {
      var blk = document.querySelector('#p-about .ed-block');
      var r = blk.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 0 });
    await wait(350);
    return JSON.parse(await ev(`(function () {
      var bar = document.querySelector('#p-about .ed-block > .ed-tools');
      if (!bar) return JSON.stringify({ err: 'no toolbar' });
      var t = [...bar.querySelectorAll('button')].find(function (b) {
        return b.textContent.indexOf(${JSON.stringify(label)}) >= 0; });
      if (!t) return JSON.stringify({ err: 'no ' + ${JSON.stringify(label)} });
      var r = t.getBoundingClientRect();
      if (!r.width || !r.height) return JSON.stringify({ err: 'button has no box' });
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`));
  };
  const clickAt = async (p) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await wait(800);
  };
  const blocks = () => count('#p-about .panel__body > *');

  check('the ✕ is nested inside the editable paragraph', await ev(`(function () {
    var bar = document.querySelector('#p-about .ed-block > .ed-tools');
    return !!bar && !!bar.closest('.ed-text');
  })()`), 'this nesting is what the capture handler used to swallow');

  const x = await aim('✕');
  check('the ✕ has a clickable box', !x.err, x.err || '');
  if (!x.err) {
    const before = await blocks();
    await clickAt(x);
    const after = await blocks();
    check('clicking ✕ reaches its handler', (await ev(`window.__confirms`)) === 1,
      `confirm() called ${await ev(`window.__confirms`)} times`);
    check('clicking ✕ deletes exactly one text box', after === before - 1, `${before} -> ${after}`);
    check('and does not open the box for editing instead',
      (await ev(`!!document.querySelector('#p-about .ed-text.is-editing')`)) === false);
  }

  /* Same toolbar, same trap — asserted so a fix aimed only at the ✕ is caught. */
  const plus = await aim('+');
  check('the + has a clickable box', !plus.err, plus.err || '');
  if (!plus.err) {
    const before = await blocks();
    await clickAt(plus);
    check('clicking + adds exactly one text box', (await blocks()) === before + 1,
      `${before} -> ${await blocks()}`);
  }

  /* Deleting one box must not throw away what you are typing in another.
   *
   * This only became reachable once the ✕ started working: before that you
   * could not click it at all. Measured on the first working build — a marker
   * typed into an open box was gone from both the DOM and the JSON after
   * deleting a different block, because the ✕ re-rendered the panel body and
   * destroyed the focused contenteditable before it had committed. */
  {
    await ev(`(function () {
      var ps = [...document.querySelectorAll('#p-about .ed-text')];
      var p = ps[ps.length - 1], b = p.getBoundingClientRect();
      p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + 40, clientY: b.top + 8 }));
    })()`);
    await wait(450);
    await ev(`document.execCommand('insertText', false, 'ZZMARKERZZ')`);
    await wait(250);
    check('a box is open with unsaved typing in it',
      await ev(`!!document.querySelector('#p-about .ed-text.is-editing')`));

    const first = await aim('✕');
    if (!first.err) {
      await clickAt(first);
      const kept = await ev(`document.querySelector('#p-about .panel__body').innerText.indexOf('ZZMARKERZZ') >= 0`);
      check('deleting another box keeps what you were typing', kept,
        kept ? 'marker survived' : 'marker discarded by the re-render');
      const alive = await count('#p-about .ed-text');
      check('and the editor is still alive afterwards', alive > 0,
        `${alive} bindings left`);
    }
  }

  /* Regression guard: the fix lets furniture clicks through, so a click on the
     WORDS must still edit rather than fall through to the site. */
  await ev(`(function () {
    var p = document.querySelector('#p-about .ed-text');
    var b = p.getBoundingClientRect();
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + 60, clientY: b.top + 10 }));
  })()`);
  await wait(400);
  check('clicking the words still edits', await ev(`!!document.querySelector('#p-about .ed-text.is-editing')`));
  await ev(`document.activeElement.blur()`); await wait(300);
}

done('the editing surface behaves.');
