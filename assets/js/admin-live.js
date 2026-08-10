/* admin-live.js — edit the site by clicking it.
 *
 * The editor is not a screen that shows your content; it is a thin layer over
 * the real page. What you click IS what ships, so there is nothing to translate
 * between "the site" and "the editor", and no preview that can drift out of
 * step with the thing it previews.
 *
 * HOW A CLICK FINDS THE JSON. Not by string paths — by a WeakMap of element to
 * a { get, set } pair, built by walking the JSON and the DOM together. Every
 * block renders exactly one top-level element (lead→p, beats→ul, skills→div),
 * so the nth child of a panel body is body[n]; the authoring comment renders as
 * an HTML comment, which is not an element child, so it shifts nothing. String
 * paths would have been one off-by-one away from silently editing the wrong
 * paragraph.
 *
 * RE-RENDER USES bake.js — the same functions that write the shipped file — so
 * the thing you are looking at mid-edit is the markup that will be committed.
 */
import { el } from './util.js';
import { panelBodyHtml } from './bake.js';

/* element -> how to read and write the value behind it */
const acc = new WeakMap();
let ctx = null;        /* { state, mark, iconIds } */
let observer = null;
let editing = null;    /* the element currently open for editing */

/* ── what may survive a paste ─────────────────────────────────────────────
 * The JSON legitimately holds a little inline HTML — the bold in "Studying for
 * CompTIA Network+" is a <strong> — so stripping everything would quietly flatten
 * real content. Allowing everything would let one paste from a web page drop a
 * stylesheet, a script or a font into the About panel. Hence an allowlist. */
const ALLOWED = { STRONG: [], B: [], EM: [], I: [], BR: [], A: ['href'] };

export function clean(html) {
  const box = document.createElement('div');
  box.innerHTML = html;
  /* The editor's own furniture lives inside the block it decorates, so an
     innerHTML read picks it up. DELETED, not unwrapped: unwrapping promotes the
     buttons' children, which would have appended a literal "+✕" to whatever
     paragraph you had just edited. Caught by a round-trip test, and it would
     have been saved into the site. */
  for (const n of box.querySelectorAll('.ed-tools, .ed-pencil, .ed-add, .ed-x, .ed-addtext')) n.remove();
  /* Repeat until stable: unwrapping a node promotes its children, which may
     themselves need unwrapping. */
  for (let pass = 0; pass < 8; pass++) {
    const bad = [...box.querySelectorAll('*')].filter((n) => !ALLOWED[n.tagName]);
    if (!bad.length) break;
    for (const n of bad) n.replaceWith(...n.childNodes);
  }
  for (const n of box.querySelectorAll('*')) {
    const allow = ALLOWED[n.tagName] || [];
    for (const a of [...n.attributes]) if (!allow.includes(a.name)) n.removeAttribute(a.name);
    /* B and I are what contenteditable produces for ctrl-B / ctrl-I; the JSON
       and the stylesheet both speak strong/em. */
    if (n.tagName === 'B' || n.tagName === 'I') {
      const t = document.createElement(n.tagName === 'B' ? 'strong' : 'em');
      t.append(...n.childNodes);
      n.replaceWith(t);
    }
  }
  return box.innerHTML.trim();
}

/* ── binding ───────────────────────────────────────────────────────────── */
function bind(node, get, set, file = 'content.json', after = null) {
  if (!node) return;
  acc.set(node, { get, set, file, after });
  node.classList.add('ed-text');
}

function bindPanel(p) {
  const body = document.querySelector(`#p-${p.id} .panel__body`);
  if (!body) return;
  const kids = [...body.children];
  p.body.forEach((b, i) => {
    const node = kids[i];
    if (!node) return;
    node.classList.add('ed-block');
    node.dataset.edBlock = `${p.id}:${i}`;

    if (b.type === 'lead' || b.type === 'p') {
      bind(node, () => b.html, (v) => { b.html = v; });
    } else if (b.type === 'h3') {
      bind(node, () => b.text, (v) => { b.text = v; });
    } else if (b.type === 'beats') {
      [...node.children].forEach((li, j) => bind(li, () => b.items[j], (v) => { b.items[j] = v; }));
    } else if (b.type === 'skills') {
      b.groups.forEach((g, gi) => {
        const sec = node.children[gi];
        if (!sec) return;
        bind(sec.querySelector('h3'), () => g.heading, (v) => { g.heading = v; });
        [...sec.querySelectorAll('li')].forEach((li, k) =>
          bind(li, () => g.items[k], (v) => { g.items[k] = v; }));
      });
    } else if (b.type === 'address') {
      bind(node.querySelector('[data-email]'), () => b.email, (v) => { b.email = v; });
      bind(node.querySelector('[data-copy-text]'), () => b.hint, (v) => { b.hint = v; });
    }
    /* cta and links are anchors wrapped round an icon, so their TEXT is edited
       in the popup rather than inline. But deleting one should not need a popup
       at all — that is the common case and it was three clicks deep. */
    if (b.type === 'cta' || b.type === 'links') {
      const rows = b.type === 'cta' ? [...node.querySelectorAll('a')]
                                    : [...node.querySelectorAll('li')];
      rows.forEach((row, j) => {
        if (row.querySelector(':scope > .ed-x')) return;
        const x = el('button', 'ed-x', '✕');
        x.type = 'button';
        x.title = 'Remove this one';
        x.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        x.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          b.items.splice(j, 1);
          ctx.mark('content.json');
          rerenderPanelOf(node);
        });
        if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
        row.appendChild(x);
      });
    }
  });

  /* Always there, so it works on a panel with nothing in it — which the
     hover-only + between blocks did not. */
  const host = document.querySelector(`#p-${p.id} .panel__body`);
  if (host && !host.querySelector(':scope > .ed-addtext')) {
    const add = el('button', 'ed-addtext', '+ Add text');
    add.type = 'button';
    add.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      p.body.push({ type: 'p', html: 'New text.' });
      ctx.mark('content.json');
      quiet(() => { host.innerHTML = panelBodyHtml(p); });
      annotate();
      /* Open the new one straight away — adding a box you then have to hunt for
         is half a feature. */
      const kids = [...host.children].filter((n) => n.classList.contains('ed-block'));
      const last = kids[kids.length - 1];
      if (last) open(last);
    });
    host.appendChild(add);
  }
}

function bindCards() {
  const chans = ctx.state.projects.channels || [];
  const projs = ctx.state.projects.projects || [];
  for (const node of document.querySelectorAll('.chan')) {
    node.classList.add('ed-card');
    const id = node.dataset.card || '';
    node.dataset.edCard = id;
    if (node.closest('.ed-add')) continue;

    /* The words on a card are edit targets; the rest of the card is not, so a
       plain click still navigates and you can reach the things inside a
       channel while editing. */
    const label = node.querySelector('.chan__label');
    const sub = node.querySelector('.chan__count');
    const ch = chans.find((c) => c.id === id);
    const pr = projs.find((x) => x.id === id);
    /* No re-render: the DOM already shows what was typed, and rebuilding the
       wall mid-edit would throw away the caret. */
    if (ch) {
      bind(label, () => ch.label, (v) => { ch.label = v; }, 'projects.json');
      bind(sub, () => ch.kind || '', (v) => { ch.kind = v; }, 'projects.json');
    } else if (pr) {
      bind(label, () => pr.title || pr.id, (v) => { pr.title = v; }, 'projects.json');
      bind(sub, () => pr.blurb || '', (v) => { pr.blurb = v; }, 'projects.json');
    }
  }
}

/* ── inline editing ────────────────────────────────────────────────────── */
/* Put the caret where the pointer is, the way every text editor does.
   selectAllChildren was here, which selected the whole paragraph — measured at
   198 of 198 characters — so the first key you pressed deleted it. That is what
   "type easily and fluently" meant. */
function placeCaret(node, e) {
  const sel = document.getSelection();
  if (!sel) return;
  let range = null;
  if (e && typeof e.clientX === 'number') {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    }
  }
  if (!range) { range = document.createRange(); range.selectNodeContents(node); }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function open(node, e) {
  const a = acc.get(node);
  if (!a || editing) return;
  editing = node;
  const before = a.get();
  /* Lift the toolbar out for the duration. Leaving it inside a contenteditable
     means you can put the caret in it, select it, and delete it. */
  const tools = node.querySelector(':scope > .ed-tools');
  tools?.remove();
  node.setAttribute('contenteditable', 'true');
  node.classList.add('is-editing');
  node.focus({ preventScroll: true });
  placeCaret(node, e);

  const finish = (commit) => {
    node.removeEventListener('keydown', onKey);
    node.removeEventListener('blur', onBlur);
    node.removeEventListener('paste', onPaste);
    node.removeAttribute('contenteditable');
    node.classList.remove('is-editing');
    editing = null;
    const next = commit ? clean(node.innerHTML) : before;
    if (commit && next !== before) {
      a.set(next);
      ctx.mark(a.file);
      if (a.after) a.after();
      else if (node.closest('.panel')) rerenderPanelOf(node);
    } else {
      node.innerHTML = before;
    }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    /* Enter is a LINE BREAK. It used to commit, which meant you could not put a
       paragraph break in your own text and every stray Enter closed the box
       mid-sentence. Escape cancels, clicking away commits, and ctrl/cmd-Enter
       commits without moving the mouse — none of which collide with typing. */
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true); }
  };
  const onBlur = () => finish(true);
  const onPaste = (e) => {
    /* Paste as text. The sanitiser would strip it anyway, but doing it here
       means what lands looks like what you will keep. */
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  };
  node.addEventListener('keydown', onKey);
  node.addEventListener('blur', onBlur);
  node.addEventListener('paste', onPaste);
}

function rerenderPanelOf(node) {
  const panel = node.closest('.panel');
  if (!panel) return;
  const id = panel.id.replace(/^p-/, '');
  const p = ctx.state.content.panels.find((x) => x.id === id);
  if (!p) return;
  const body = panel.querySelector('.panel__body');
  quiet(() => { body.innerHTML = panelBodyHtml(p); });
  annotate();
}

/* ── block controls ────────────────────────────────────────────────────── */
function blockTools(node) {
  const [id, idx] = node.dataset.edBlock.split(':');
  const p = ctx.state.content.panels.find((x) => x.id === id);
  const i = Number(idx);
  const bar = el('div', 'ed-tools');

  const btn = (label, title, fn) => {
    const b = el('button', 'ed-tool', label);
    b.type = 'button'; b.title = title;
    b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    bar.appendChild(b);
  };

  const b = p.body[i];
  if (b.type === 'cta' || b.type === 'links') {
    btn('✎', 'Edit these buttons', () => ctx.openLinkEditor(p, i));
  }
  btn('+', 'Add a paragraph below', () => {
    p.body.splice(i + 1, 0, { type: 'p', html: 'New text.' });
    ctx.mark('content.json');
    rerenderPanelOf(node);
  });
  btn('✕', 'Delete this', () => {
    if (!confirm('Delete this?')) return;
    p.body.splice(i, 1);
    ctx.mark('content.json');
    rerenderPanelOf(node);
  });
  return bar;
}

/* ── annotate everything currently on screen ───────────────────────────── */
function quiet(fn) {
  observer?.disconnect();
  try { fn(); } finally { if (observer) observe(); }
}

export function annotate() {
  if (!ctx) return;
  /* Never while a box is open. Typing is a mutation, so the observer fired on
     every keystroke and re-inserted the block toolbar INTO the element being
     edited — measured as one keystroke adding three characters, because "+"
     and "✕" came back with it. Nothing structural changes while you type, so
     annotation waits for the commit. */
  if (editing) return;
  quiet(() => {
    for (const p of ctx.state.content.panels) bindPanel(p);
    bindCards();

    /* one hover toolbar per block, created lazily */
    for (const node of document.querySelectorAll('.ed-block')) {
      if (node.querySelector(':scope > .ed-tools')) continue;
      const pos = getComputedStyle(node).position;
      if (pos === 'static') node.style.position = 'relative';
      node.appendChild(blockTools(node));
    }
    /* a pencil on every card, so a plain click still navigates */
    for (const node of document.querySelectorAll('.ed-card')) {
      if (node.querySelector(':scope > .ed-pencil')) continue;
      const b = el('button', 'ed-pencil', '✎');
      b.type = 'button'; b.title = 'Edit this card';
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        ctx.openCardEditor(node.dataset.edCard);
      });
      node.appendChild(b);
    }
    ctx.paintAddTile?.();
  });
}

function observe() {
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
                                    attributeFilter: ['hidden', 'class'] });
}

/* ── enter / leave ─────────────────────────────────────────────────────── */
export function enter(context) {
  ctx = context;
  document.body.dataset.editing = '1';

  document.addEventListener('click', onClick, true);
  let queued = false;
  observer = new MutationObserver(() => {
    /* The site rebuilds the wall on every navigation and unhides panels on
       demand, so anything can appear at any time. Coalesce to one pass a frame
       rather than re-annotating per mutation. */
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; annotate(); });
  });
  observe();
  annotate();
}

export function leave() {
  document.removeEventListener('click', onClick, true);
  observer?.disconnect();
  observer = null;
  delete document.body.dataset.editing;
  for (const n of document.querySelectorAll('.ed-tools, .ed-pencil, .ed-x, .ed-addtext')) n.remove();
  for (const n of document.querySelectorAll('.ed-text, .ed-block, .ed-card')) {
    n.classList.remove('ed-text', 'ed-block', 'ed-card', 'is-editing');
    n.removeAttribute('contenteditable');
  }
  ctx = null;
}

function onClick(e) {
  if (!ctx) return;
  /* The + is a real card in the grid now, so its click would otherwise route to
     a project called "__add". */
  if (e.target.closest?.('.ed-add')) {
    e.preventDefault(); e.stopPropagation();
    ctx.addProject();
    return;
  }
  const t = e.target.closest?.('.ed-text');
  if (!t || editing === t) return;
  /* Capture phase: stop the site acting on the click — a paragraph inside a
     panel is harmless, but a link would navigate away mid-edit. */
  e.preventDefault();
  e.stopPropagation();
  open(t, e);
}
