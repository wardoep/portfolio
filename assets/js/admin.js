/* admin.js — the editor. Lazy-loaded, so a visitor never downloads it.
 *
 * TWO BACKENDS, and it picks the safer one automatically:
 *
 *   local   serve.py --admin is answering, i.e. you are at the desk. Writes
 *           straight to disk with no credential at all, and ./deploy.sh still
 *           runs all twenty checks before anything ships. Preferred whenever
 *           it is available.
 *   github  anywhere else, including penna.lol. Commits to the repository with
 *           a token that the password decrypts.
 *
 * WHAT GUARDS A GITHUB SAVE. rules.js runs first and refuses outright — it
 * mirrors the checks that matter most, including the one that stops a phone
 * number or a home town reaching a permanently-archived public URL. What it
 * CANNOT check from a browser: contrast ratios, icons existing in the sprite,
 * resume.pdf matching its source, and projects.json being in step with GitHub.
 * Those still only run on ./deploy.sh here, or in CI once .github/workflows
 * lands — so a local deploy remains the last word.
 *
 * THE PASSWORD DOES REAL WORK in github mode: it is the key the token is sealed
 * with (see gh.js), so what sits in localStorage is useless without it and
 * "wrong password" and "cannot decrypt" are the same event. Locally it is
 * checked by serve.py, which is the only check that counts there since anyone
 * can curl the endpoint.
 *
 * Everything is edited as DATA. This module never writes markup by hand — the
 * generators in bake.js turn data into HTML, and they are the same functions
 * the local scripts use, so a save from a browser and a bake from a terminal
 * produce identical bytes.
 *
 * And nothing publishes without passing rules.js first, which mirrors the parts
 * of publish.sh that can run in a browser. publish.sh remains the authority.
 */
import { el } from './util.js';
import * as live from './admin-live.js';
import * as router from './router.js';
import * as grid from './grid.js';
import * as gh from './gh.js';
import * as rules from './rules.js';
import { applyPanels, applyResume } from './bake.js';

const API = new URL('__admin/', location.href.split('#')[0]).href;
const KEY = 'pf-admin-key';

let state = null;      /* { content, projects, resume } */
let dirty = new Set(); /* which files need writing */
let host = null;
let iconIds = [];

const key = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const setKey = (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } };

/* ── which backend? ────────────────────────────────────────────────────────
 * local  — serve.py --admin is answering. No credential, writes straight to
 *          disk, and every gate still runs on ./deploy.sh. The better path.
 * github — anywhere else. Commits to the repo with a token the password
 *          decrypts, and CI runs the checks after the fact.
 * The local endpoint wins whenever it exists, so being at the desk is
 * automatically the safer mode without having to remember anything. */
let mode = 'github';

export async function whichBackend() {
  try {
    const r = await fetch(API + 'ping', { cache: 'no-store' });
    if (r.ok) return 'local';
  } catch { /* not running locally — that is the normal case on penna.lol */ }
  return 'github';
}

async function load() {
  const grab = async (f) => (await fetch(`data/${f}?t=${Date.now()}`, { cache: 'no-store' })).json();
  state = {
    content: await grab('content.json'),
    projects: await grab('projects.json'),
    resume: await grab('resume.json'),
  };
  /* The icon picker offers exactly what the sprite contains — publish.sh check 9
     fails the build on an icon that does not exist, so the picker must not be
     able to choose one. */
  iconIds = [...document.querySelectorAll('.sprite g[id^="i-"]')].map((g) => g.id).sort();
}

/* ── tiny form helpers ─────────────────────────────────────────────────── */
const mark = (file) => { dirty.add(file); sticky = null; paintBar(); };

function field(label, value, onInput, { area = false, mono = false } = {}) {
  const wrap = el('label', 'af');
  wrap.appendChild(el('span', 'af__label', label));
  const input = document.createElement(area ? 'textarea' : 'input');
  input.className = 'af__input' + (mono ? ' af__input--mono' : '');
  input.value = value ?? '';
  if (area) input.rows = Math.min(8, Math.max(2, String(value ?? '').length / 70 + 1));
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}

function toggle(label, checked, onChange) {
  const wrap = el('label', 'af af--row');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);
  wrap.appendChild(el('span', 'af__label', label));
  return wrap;
}

/* A list of strings, with add / remove / reorder. Used for every bullet list on
   the site — beats, skill groups, résumé bullets. */
function stringList(items, onChange, { label = 'Items', area = true } = {}) {
  const box = el('div', 'alist');
  box.appendChild(el('span', 'af__label', label));
  const redraw = () => {
    [...box.querySelectorAll('.alist__row')].forEach((n) => n.remove());
    items.forEach((v, i) => {
      const row = el('div', 'alist__row');
      const input = document.createElement(area ? 'textarea' : 'input');
      input.className = 'af__input';
      if (area) input.rows = 2;
      input.value = v;
      input.addEventListener('input', () => { items[i] = input.value; onChange(); });
      row.appendChild(input);
      const tools = el('div', 'alist__tools');
      const btn = (t, title, fn) => {
        const b = el('button', 'abtn abtn--icon', t);
        b.type = 'button'; b.title = title;
        b.addEventListener('click', () => { fn(); onChange(); redraw(); });
        tools.appendChild(b);
      };
      btn('↑', 'Move up', () => { if (i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]]; });
      btn('↓', 'Move down', () => { if (i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]]; });
      btn('✕', 'Remove', () => items.splice(i, 1));
      row.appendChild(tools);
      box.appendChild(row);
    });
  };
  redraw();
  const add = el('button', 'abtn', '+ Add');
  add.type = 'button';
  add.addEventListener('click', () => { items.push(''); onChange(); redraw(); box.appendChild(add); });
  box.appendChild(add);
  return box;
}

/* ── the icon picker ───────────────────────────────────────────────────── */
function iconPicker(current, onPick) {
  const wrap = el('div', 'af');
  wrap.appendChild(el('span', 'af__label', 'Icon'));
  const grid = el('div', 'apick');
  const draw = () => {
    grid.textContent = '';
    for (const id of iconIds) {
      const b = el('button', 'apick__i' + (id === current ? ' is-on' : ''));
      b.type = 'button'; b.title = id;
      b.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;
      b.addEventListener('click', () => { current = id; onPick(id); draw(); });
      grid.appendChild(b);
    }
  };
  draw();
  wrap.appendChild(grid);
  return wrap;
}

/* ── panels ────────────────────────────────────────────────────────────── */
function blockEditor(b) {
  const box = el('div', 'ablock');
  box.appendChild(el('span', 'ablock__type', b.type));
  const changed = () => mark('content.json');

  if (b.type === 'lead' || b.type === 'p') {
    box.appendChild(field('Text', b.html, (v) => { b.html = v; changed(); }, { area: true }));
  } else if (b.type === 'h3') {
    box.appendChild(field('Heading', b.text, (v) => { b.text = v; changed(); }));
  } else if (b.type === 'beats') {
    box.appendChild(stringList(b.items, changed, { label: 'Bullets' }));
  } else if (b.type === 'address') {
    box.appendChild(field('Email', b.email, (v) => { b.email = v; changed(); }));
    box.appendChild(field('Hint', b.hint, (v) => { b.hint = v; changed(); }));
  } else if (b.type === 'cta' || b.type === 'links') {
    b.items.forEach((it) => {
      const sub = el('div', 'ablock ablock--sub');
      sub.appendChild(field('Label', it.label, (v) => { it.label = v; changed(); }));
      sub.appendChild(field('Link', it.href, (v) => { it.href = v; changed(); }, { mono: true }));
      if (b.type === 'links') sub.appendChild(iconPicker(it.icon, (v) => { it.icon = v; changed(); }));
      sub.appendChild(toggle('Opens in a new tab', it.external, (v) => {
        if (v) it.external = true; else delete it.external; changed();
      }));
      box.appendChild(sub);
    });
  } else if (b.type === 'skills') {
    b.groups.forEach((g) => {
      const sub = el('div', 'ablock ablock--sub');
      sub.appendChild(field('Group', g.heading, (v) => { g.heading = v; changed(); }));
      sub.appendChild(stringList(g.items, changed, { label: 'Skills', area: false }));
      box.appendChild(sub);
    });
  }
  return box;
}

function panelsView() {
  const out = el('div');
  out.appendChild(el('p', 'anote',
    'Panel copy. Saving rewrites index.html from this, so the words stay in the ' +
    'page source where a scraper can still find them.'));
  for (const p of state.content.panels) {
    const sec = el('details', 'acard');
    sec.appendChild(el('summary', 'acard__head', p.title));
    sec.appendChild(field('Title', p.title, (v) => { p.title = v; mark('content.json'); }));
    sec.appendChild(iconPicker(p.icon, (v) => { p.icon = v; mark('content.json'); }));
    p.body.forEach((b) => sec.appendChild(blockEditor(b)));
    out.appendChild(sec);
  }
  return out;
}

/* ── home ──────────────────────────────────────────────────────────────── */
function homeView() {
  const out = el('div');
  out.appendChild(el('p', 'anote', 'The three cards on the front screen.'));
  out.appendChild(toggle('Show a line of text under each card', state.content.home?.cardText,
    (v) => { (state.content.home ||= {}).cardText = v; mark('content.json'); }));
  out.appendChild(el('p', 'anote',
    'The text itself is each channel’s “kind” line, edited under Projects.'));
  return out;
}

/* ── projects and builds ───────────────────────────────────────────────── */
function projectRow(p) {
  const sec = el('details', 'acard');
  const head = el('summary', 'acard__head', `${p.title || p.id}${p.hidden ? '  (hidden)' : ''}`);
  sec.appendChild(head);
  const changed = () => mark('projects.json');

  sec.appendChild(field('Name shown on the card', p.title, (v) => { p.title = v; changed(); }));
  sec.appendChild(field('Blurb', p.blurb, (v) => { p.blurb = v; changed(); }, { area: true }));

  const folder = el('label', 'af');
  folder.appendChild(el('span', 'af__label', 'Folder'));
  const sel = document.createElement('select');
  sel.className = 'af__input';
  for (const f of state.projects.folders) {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.label; o.selected = f.id === p.folder;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { p.folder = sel.value; changed(); });
  folder.appendChild(sel);
  sec.appendChild(folder);

  sec.appendChild(iconPicker('i-' + (p.icon || 'default'), (v) => {
    p.icon = v.replace(/^i-/, ''); changed();
  }));
  sec.appendChild(stringList(p.stack ||= [], changed, { label: 'Stack chips', area: false }));
  sec.appendChild(field('Link label', p.linkLabel, (v) => { p.linkLabel = v; changed(); }));
  sec.appendChild(toggle('Featured', p.featured, (v) => { p.featured = v; changed(); }));
  sec.appendChild(toggle('Hidden', p.hidden, (v) => { p.hidden = v; changed(); }));
  return sec;
}

function projectsView() {
  const out = el('div');
  out.appendChild(el('p', 'anote',
    'Projects and builds. A repo that exists on GitHub keeps its description in ' +
    'sync automatically; one you add here has no GitHub id, so the sync leaves ' +
    'it alone entirely.'));

  const add = el('button', 'abtn abtn--go', '+ Add something that is not a repo');
  add.type = 'button';
  add.addEventListener('click', () => {
    const id = 'new-' + Date.now().toString(36);
    state.projects.projects.push({
      id, title: 'Untitled', blurb: '', folder: 'builds', icon: 'default',
      stack: [], highlights: [], featured: false, hidden: true,
      order: 900, status: 'live', renamedFrom: [],
    });
    mark('projects.json');
    render();
  });
  out.appendChild(add);

  for (const f of state.projects.folders) {
    const inFolder = state.projects.projects.filter((p) => p.folder === f.id);
    if (!inFolder.length) continue;
    out.appendChild(el('h3', 'ah3', f.label));
    inFolder.forEach((p) => out.appendChild(projectRow(p)));
  }
  return out;
}

/* ── résumé ────────────────────────────────────────────────────────────── */
function resumeView() {
  const out = el('div');
  out.appendChild(el('p', 'anote',
    'The résumé page. Saving rewrites resume.html — the PDF is then stale until ' +
    './deploy.sh re-renders it, and the build refuses to ship a mismatch.'));
  const r = state.resume;
  const changed = () => mark('resume.json');

  out.appendChild(field('Name', r.name, (v) => { r.name = v; changed(); }));
  out.appendChild(field('Role', r.role, (v) => { r.role = v; changed(); }));

  for (const s of r.sections) {
    const sec = el('details', 'acard');
    sec.appendChild(el('summary', 'acard__head', s.heading));
    sec.appendChild(field('Heading', s.heading, (v) => { s.heading = v; changed(); }));

    if (s.type === 'prose') {
      sec.appendChild(field('Text', s.html, (v) => { s.html = v; changed(); }, { area: true }));
    } else if (s.type === 'deflist') {
      s.items.forEach((i) => {
        const sub = el('div', 'ablock ablock--sub');
        sub.appendChild(field('Group', i.term, (v) => { i.term = v; changed(); }));
        sub.appendChild(field('Skills', i.desc, (v) => { i.desc = v; changed(); }, { area: true }));
        sec.appendChild(sub);
      });
    } else {
      s.entries.forEach((e) => {
        const sub = el('div', 'ablock ablock--sub');
        sub.appendChild(field('Title', e.title, (v) => { e.title = v; changed(); }));
        if (e.when !== undefined) sub.appendChild(field('Dates', e.when, (v) => { e.when = v; changed(); }));
        if (e.note !== undefined) sub.appendChild(field('Note', e.note, (v) => { e.note = v; changed(); }, { area: true }));
        if (e.where !== undefined) sub.appendChild(field('Extra line', e.where, (v) => { e.where = v; changed(); }));
        if (e.bullets) sub.appendChild(stringList(e.bullets, changed, { label: 'Bullets' }));
        sec.appendChild(sub);
      });
    }
    out.appendChild(sec);
  }
  return out;
}

/* ── shell ─────────────────────────────────────────────────────────────── */
const TABS = [
  ['home', 'Home screen', homeView],
  ['panels', 'Panels', panelsView],
  ['projects', 'Projects & builds', projectsView],
  ['resume', 'Résumé', resumeView],
];
let tab = 'home';

/* ONE writer for the status bar.
 *
 * There used to be two: say() put the real message up and paintBar() overwrote
 * it a line later with "unsaved: content.json". So every failed save destroyed
 * its own explanation and left you looking at the dirty-file list wondering what
 * had happened. Reported as "getting this error when i try and save", and the
 * error was never the message — it was the absence of one.
 *
 * A message set with sticky:true survives repaints until the next real action
 * clears it. */
let sticky = null;

function paintBar() {
  const bar = host?.querySelector('[data-abar]');
  if (!bar) return;
  if (sticky) {
    bar.textContent = sticky.text;
    bar.classList.toggle('is-bad', !!sticky.bad);
    bar.classList.toggle('is-dirty', !sticky.bad && dirty.size > 0);
    return;
  }
  bar.classList.remove('is-bad');
  bar.textContent = dirty.size ? `unsaved: ${[...dirty].join(', ')}` : 'saved';
  bar.classList.toggle('is-dirty', dirty.size > 0);
}

const FILES = () => ({
  'content.json': state.content,
  'projects.json': state.projects,
  'resume.json': state.resume,
});

function say(msg, bad = false, keep = false) {
  sticky = keep ? { text: msg, bad } : null;
  const n = host.querySelector('[data-abar]');
  if (!n) return;
  n.textContent = msg;
  n.classList.toggle('is-bad', bad);
  n.classList.toggle('is-dirty', !bad && dirty.size > 0);
}

/* Everything the editor could publish, checked before it can. These mirror
   publish.sh; they are not a replacement for it, but they turn "find out from a
   red build in two minutes" into "find out while you are typing it". */
function blockers() {
  const found = rules.check(FILES());
  if (!found.length) return null;
  return found.map((f) => `${f.where}: ${f.why}${f.quote ? ` — “${f.quote}”` : ''}`);
}

async function saveLocal() {
  for (const f of [...dirty]) {
    say(`saving ${f}…`);
    const r = await fetch(API + f, {
      method: 'PUT',
      headers: { 'X-Admin-Key': key(), 'Content-Type': 'application/json' },
      body: JSON.stringify(FILES()[f]),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { say(`failed on ${f}: ${out.error || r.status}`, true); return false; }
    dirty.delete(f);
  }
  say('saved — reload to see it, then ./deploy.sh to publish', false, true);
  return true;
}

/* One commit carrying the JSON AND the HTML it bakes to. Committing the JSON
   alone would leave the repo briefly inconsistent — Pages could rebuild between
   the two and serve a half-applied edit — and would fail publish.sh check 16
   until something ran the generators. */
async function saveGithub(token) {
  const files = {};
  for (const f of dirty) files[`data/${f}`] = JSON.stringify(FILES()[f], null, 2) + '\n';

  if (dirty.has('content.json')) {
    say('baking index.html…');
    files['index.html'] = applyPanels(await gh.readFile(token, 'index.html'), state.content);
  }
  if (dirty.has('resume.json')) {
    say('baking resume.html…');
    files['resume.html'] = applyResume(await gh.readFile(token, 'resume.html'), state.resume);
  }

  say('committing…');
  const sha = await gh.commit(token, files, 'Edit content from the admin panel');
  dirty.clear();
  const note = files['resume.html']
    ? ' — the résumé PDF is stale until CI or ./deploy.sh re-renders it'
    : '';
  say(`published ${sha.slice(0, 7)} — live in about a minute${note}`, false, true);
  return true;
}

async function save() {
  const stop = blockers();
  if (stop) {
    say(`refused: ${stop[0]}`, true);
    /* Everything, not just the first — fixing them one build at a time is how
       people give up on a gate. */
    console.warn('admin: refused to publish\n' + stop.join('\n'));
    alert('Not saved. This would fail the build:\n\n' + stop.join('\n'));
    return;
  }
  if (!dirty.size) { say('nothing to save'); return; }
  sticky = null;
  try {
    if (mode === 'local') { await saveLocal(); }
    else {
      /* Ask before attempting. Without this the commit went out with a null
         token and came back as a bare 401, which says nothing about the thing
         you actually have to do. */
      if (!gh.hasToken()) {
        say('No GitHub token yet — close and reopen the editor to add one.', true, true);
        return;
      }
      const token = await gh.unlock(key());
      if (!token) {
        say('That password no longer unlocks the saved token. Reopen the editor.', true, true);
        return;
      }
      await saveGithub(token);
    }
  } catch (e) {
    /* Sticky: this is the whole reason the save did not happen, and repainting
       over it is what made the bug unreportable. */
    say(String(e.message || e), true, true);
  }
}

let raw = false;      /* are the forms showing? */

function setRaw(on) {
  raw = on;
  const forms = host.querySelector('[data-araw]');
  forms.hidden = !on;
  host.querySelector('[data-arawbtn]').classList.toggle('is-on', on);
  if (on) { grid.setEditing(false); live.leave(); render(); } else { liveEnter(); }
}

function liveEnter() {
  grid.setEditing(true);
  live.enter({
    state,
    mark,
    openCardEditor,
    openLinkEditor,
    addProject,
    paintAddTile,
  });
}

function shell() {
  const wrap = el('div', 'aroot');

  const bar = el('header', 'abar');
  bar.appendChild(el('strong', 'abar__title', 'Editing'));
  bar.appendChild(el('span', 'abar__hint', 'click any text or the ✎ on a card'));

  const status = el('span', 'admin__status', 'saved');
  status.dataset.abar = '';
  bar.appendChild(status);

  const rawBtn = el('button', 'abtn', 'Raw');
  rawBtn.type = 'button';
  rawBtn.dataset.arawbtn = '';
  rawBtn.title = 'The plain forms — for fields with nothing on the page to click';
  rawBtn.addEventListener('click', () => setRaw(!raw));
  bar.appendChild(rawBtn);

  const cv = el('button', 'abtn', 'Résumé page');
  cv.type = 'button';
  cv.addEventListener('click', openResume);
  bar.appendChild(cv);

  const saveBtn = el('button', 'abtn abtn--go', 'Save');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', save);
  bar.appendChild(saveBtn);

  const leave = el('button', 'abtn', 'Close');
  leave.type = 'button';
  leave.addEventListener('click', () => { unmount(); router.home(); });
  bar.appendChild(leave);

  wrap.appendChild(bar);

  /* The forms, hidden until Raw. They are still the only way to reach a
     project's hidden flag, its order, featured, and which folder it is in —
     none of which have anything on the page to click. */
  const forms = el('div', 'admin');
  forms.dataset.araw = '';
  forms.hidden = true;
  const tabs = el('nav', 'admin__tabs');
  for (const [id, label] of TABS) {
    const b = el('button', 'abtn', label);
    b.type = 'button'; b.dataset.atab = id;
    b.addEventListener('click', () => { tab = id; render(); });
    tabs.appendChild(b);
  }
  forms.appendChild(tabs);
  const body = el('div', 'admin__body');
  body.dataset.abody = '';
  forms.appendChild(body);
  wrap.appendChild(forms);

  return wrap;
}

function render() {
  const body = host.querySelector('[data-abody]');
  if (!body) return;
  body.textContent = '';
  body.appendChild(TABS.find(([id]) => id === tab)[2]());
  [...host.querySelectorAll('[data-atab]')].forEach((b) => {
    b.classList.toggle('is-on', b.dataset.atab === tab);
  });
}

/* ── a popup, reused by cards, link rows and the résumé ────────────────── */
function popup(title, build) {
  document.querySelector('.ed-modal')?.remove();
  const back = el('div', 'ed-modal');
  const box = el('div', 'ed-modal__box');
  box.appendChild(el('h2', 'ed-modal__t', title));
  const bodyEl = el('div', 'ed-modal__body');
  box.appendChild(bodyEl);
  const foot = el('div', 'ed-modal__foot');
  const done = el('button', 'abtn abtn--go', 'Done');
  done.type = 'button';
  done.addEventListener('click', () => back.remove());
  foot.appendChild(done);
  box.appendChild(foot);
  back.appendChild(box);
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  build(bodyEl, () => back.remove());
  return bodyEl;
}

/* ── editing one card ──────────────────────────────────────────────────── */
function openCardEditor(id) {
  const ch = state.projects.channels.find((c) => c.id === id);
  const pr = state.projects.projects.find((x) => x.id === id);
  if (!ch && !pr) return;
  const changed = () => mark('projects.json');

  popup(ch ? `Card — ${ch.label}` : `Card — ${pr.title || pr.id}`, (box) => {
    if (ch) {
      box.appendChild(field('Name on the card', ch.label, (v) => { ch.label = v; changed(); }));
      box.appendChild(field('Line underneath', ch.kind, (v) => { ch.kind = v; changed(); }));
      box.appendChild(iconPicker('i-' + (ch.icon || 'default'),
        (v) => { ch.icon = v.replace(/^i-/, ''); changed(); }));
      box.appendChild(el('p', 'anote',
        'The line underneath only shows when “text under the cards” is on, in Raw → Home screen.'));
      return;
    }
    box.appendChild(field('Name on the card', pr.title, (v) => { pr.title = v; changed(); }));
    box.appendChild(field('Line underneath', pr.blurb, (v) => { pr.blurb = v; changed(); }, { area: true }));
    box.appendChild(iconPicker('i-' + (pr.icon || 'default'),
      (v) => { pr.icon = v.replace(/^i-/, ''); changed(); }));
    box.appendChild(stringList(pr.stack ||= [], changed, { label: 'Stack chips', area: false }));

    /* What the card does. A project normally opens its own panel; giving it an
       href sends you straight out instead — which is what "the github i want it
       to direct to" asks for, and grid.js honours it the way it already does
       for a channel. */
    const jump = el('div', 'af');
    jump.appendChild(el('span', 'af__label', 'What it does'));
    const sel = document.createElement('select');
    sel.className = 'af__input';
    for (const [v, t] of [['panel', 'Open its own page here'], ['out', 'Go straight to the link below']]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = t; o.selected = (v === 'out') === !!pr.href;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      if (sel.value === 'out') pr.href = pr.url || '';
      else delete pr.href;
      changed();
    });
    jump.appendChild(sel);
    box.appendChild(jump);

    box.appendChild(field('GitHub link', pr.url || pr.href || '', (v) => {
      pr.url = v;
      if (pr.href !== undefined) pr.href = v;
      changed();
    }, { mono: true }));
  });
}

/* ── editing a row of buttons or links ─────────────────────────────────── */
function openLinkEditor(panel, blockIndex) {
  const b = panel.body[blockIndex];
  const changed = () => mark('content.json');
  popup(b.type === 'cta' ? 'Buttons' : 'Links', (box) => {
    b.items.forEach((it, i) => {
      const sub = el('div', 'ablock ablock--sub');
      sub.appendChild(field('Label', it.label, (v) => { it.label = v; changed(); }));
      sub.appendChild(field('Link', it.href, (v) => { it.href = v; changed(); }, { mono: true }));
      if (b.type === 'links') sub.appendChild(iconPicker(it.icon, (v) => { it.icon = v; changed(); }));
      sub.appendChild(toggle('Opens in a new tab', it.external, (v) => {
        if (v) it.external = true; else delete it.external; changed();
      }));
      const rm = el('button', 'abtn', 'Remove this one');
      rm.type = 'button';
      rm.addEventListener('click', () => { b.items.splice(i, 1); changed(); live.annotate(); rm.closest('.ed-modal').remove(); });
      sub.appendChild(rm);
      box.appendChild(sub);
    });
    const add = el('button', 'abtn abtn--go', '+ Add one');
    add.type = 'button';
    add.addEventListener('click', () => {
      b.items.push({ label: 'New link', href: '#/', ...(b.type === 'links' ? { icon: 'i-arrow-r' } : {}) });
      changed(); live.annotate(); add.closest('.ed-modal').remove();
    });
    box.appendChild(add);
  });
}

/* ── the + tile ────────────────────────────────────────────────────────────
 * grid.js renders and COUNTS it now. It used to be appended here, straight into
 * the DOM, which left shapeFor() and centreLastRow() computing from a count one
 * short — so the lone card on the last row was shifted to centre itself and
 * landed on top of the +. One overlapping pair at every viewport. */
function paintAddTile() { /* grid.js does this; kept so the context shape is stable */ }

function addProject() {
  const chId = router.route().arg;
  const ch = state.projects.channels.find((c) => c.id === chId);
  const folders = (ch?.folders || ['builds']);
  const id = 'new-' + Date.now().toString(36);
  const p = {
    id, title: 'New card', blurb: 'What this is.',
    folder: folders[0], icon: 'default',
    stack: [], highlights: [], featured: false, hidden: false,
    order: 900, status: 'live', renamedFrom: [], url: '',
  };
  state.projects.projects.push(p);
  mark('projects.json');
  openCardEditor(id);
}

/* ── the résumé page, edited in place ──────────────────────────────────── */
function openResume() {
  popup('Résumé page', (box) => {
    box.appendChild(el('p', 'anote',
      'The real résumé page. Click any line to change it. Saving leaves the PDF ' +
      'stale until ./deploy.sh re-renders it.'));
    const frame = document.createElement('iframe');
    frame.className = 'ed-frame';
    frame.src = 'resume.html';
    /* An iframe of the actual page, with the editing layer injected at runtime.
       resume.html keeps shipping with no JavaScript at all — it is the page that
       gets printed and read by applicant tracking systems, and a re-creation of
       its look here could drift from it. */
    frame.addEventListener('load', () => wireResume(frame));
    box.appendChild(frame);
  });
}

function wireResume(frame) {
  const doc = frame.contentDocument;
  if (!doc) return;
  const r = state.resume;
  const pairs = [];
  const push = (sel, get, set, root = doc) => {
    const n = root.querySelector(sel);
    if (n) pairs.push([n, get, set]);
  };
  push('h1', () => r.name, (v) => { r.name = v; });
  push('.role', () => r.role, (v) => { r.role = v; });

  const h2s = [...doc.querySelectorAll('h2')];
  r.sections.forEach((s, si) => {
    if (h2s[si]) pairs.push([h2s[si], () => s.heading, (v) => { s.heading = v; }]);
  });
  const entries = [...doc.querySelectorAll('.entry')];
  let ei = 0;
  for (const s of r.sections) {
    if (s.type === 'prose') continue;
    if (s.type === 'deflist') continue;
    for (const e of s.entries) {
      const node = entries[ei++];
      if (!node) continue;
      const t = node.querySelector('.entry__title');
      if (t) pairs.push([t, () => e.title, (v) => { e.title = v; }]);
      const w = node.querySelector('.entry__when');
      if (w && e.when !== undefined) pairs.push([w, () => e.when, (v) => { e.when = v; }]);
      [...node.querySelectorAll('li')].forEach((li, j) =>
        pairs.push([li, () => e.bullets[j], (v) => { e.bullets[j] = v; }]));
    }
  }

  const style = doc.createElement('style');
  style.textContent = `[data-ed]{outline:1px dashed rgba(120,120,120,.6);cursor:text}
    [data-ed]:hover{outline:2px solid #2b6cb0;background:rgba(43,108,176,.06)}`;
  doc.head.appendChild(style);

  for (const [node, get, set] of pairs) {
    node.dataset.ed = '1';
    node.addEventListener('click', () => {
      node.setAttribute('contenteditable', 'true');
      node.focus();
      const finish = () => {
        node.removeAttribute('contenteditable');
        const v = live.clean(node.innerHTML);
        if (v !== get()) { set(v); mark('resume.json'); }
        node.removeEventListener('blur', finish);
      };
      node.addEventListener('blur', finish);
    });
  }
}

/* ── the gate ──────────────────────────────────────────────────────────────
 * Two shapes. Locally the password is just checked against serve.py. On
 * penna.lol the password IS the key: it decrypts the stored GitHub token, so a
 * wrong password cannot produce one. Nothing is stored in plain text, and
 * "wrong password" and "cannot decrypt" are the same event.
 */
function gate(onOk) {
  const wrap = el('div', 'admin admin--lock');
  const form = el('form', 'alock');
  form.appendChild(el('p', 'alock__t', 'Editor'));

  const pw = document.createElement('input');
  pw.type = 'password'; pw.className = 'af__input';
  pw.placeholder = 'password'; pw.autocomplete = 'current-password';
  form.appendChild(pw);

  /* First run in github mode: there is no token yet, so ask for one and seal it
     with the password. Asked for once, never shown again. */
  const needToken = mode === 'github' && !gh.hasToken();
  let tok = null;
  if (needToken) {
    form.appendChild(el('p', 'alock__hint',
      'First time here. Paste a GitHub token with Contents: read and write on ' +
      'this repository. It is encrypted with the password above and stored only ' +
      'in this browser.'));
    tok = document.createElement('input');
    tok.type = 'password'; tok.className = 'af__input';
    tok.placeholder = 'github token'; tok.autocomplete = 'off';
    form.appendChild(tok);
  }

  const err = el('p', 'alock__err');
  form.appendChild(err);
  const go = el('button', 'abtn abtn--go', 'Unlock');
  go.type = 'submit';
  form.appendChild(go);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    go.disabled = true;
    try {
      if (mode === 'local') {
        /* Verified by attempting a real write the server can reject. There is
           deliberately no "is this password right" endpoint — that would be a
           free oracle for guessing. */
        const r = await fetch(API + 'content.json', {
          method: 'PUT',
          headers: { 'X-Admin-Key': pw.value, 'Content-Type': 'application/json' },
          body: JSON.stringify(state.content),
        });
        if (!r.ok) throw new Error('Wrong password.');
      } else if (needToken) {
        const who = await gh.whoami(tok.value.trim());
        await gh.saveToken(tok.value.trim(), pw.value);
        console.info(`admin: token accepted for ${who}`);
      } else {
        const token = await gh.unlock(pw.value);
        if (!token) throw new Error('Wrong password.');
        await gh.whoami(token);      /* also catches an expired token */
      }
      setKey(pw.value);
      onOk();
    } catch (ex) {
      err.textContent = String(ex.message || ex);
      pw.select();
    } finally {
      go.disabled = false;
    }
  });

  wrap.appendChild(form);
  host.appendChild(wrap);
  pw.focus();
}

let mounted = false;

export async function mount(node) {
  if (mounted) return;          /* typing the word again must not stack editors */
  mounted = true;
  host = node;
  host.textContent = '';
  mode = await whichBackend();
  await load();
  const start = () => {
    host.textContent = '';
    host.appendChild(shell());
    paintBar();
    liveEnter();              /* click-the-site is the default; Raw is the escape hatch */
    /* Drop straight back to the home screen so navigation behaves normally
       while editing — the URL is not a mode any more, the bar is. */
    router.home();
  };
  /* A remembered password is not enough in github mode — it still has to
     actually decrypt a token that still works. */
  if (mode === 'local' && key()) start();
  else if (mode === 'github' && key() && await gh.unlock(key())) start();
  else gate(start);
}

export function unmount() {
  mounted = false;
  grid.setEditing(false);
  live.leave();
  document.querySelector('.ed-modal')?.remove();
  if (host) host.textContent = '';
  dirty.clear();
  sticky = null;
}
