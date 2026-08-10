/* admin.js — the editor. Lazy-loaded: nothing here reaches a visitor.
 *
 * It only exists where the local write endpoint answers. On penna.lol the probe
 * 404s and this module is never even fetched, so there is no editor to find, no
 * credential to steal and nothing to leave logged in. The password is the second
 * lock; not being reachable is the first.
 *
 * The password is checked HERE for the UI and by serve.py for every write. Only
 * the second one counts — anyone can curl the endpoint — which is why the test
 * for it uses curl rather than driving this screen.
 *
 * Everything is edited as data. The generators turn data into HTML; this never
 * writes markup, so no amount of clicking can produce a broken page. The worst
 * it can do is save copy you did not mean, and ./deploy.sh still has to agree
 * before that reaches anyone.
 */
import { el } from './util.js';

const API = new URL('__admin/', location.href.split('#')[0]).href;
const KEY = 'pf-admin-key';

let state = null;      /* { content, projects, resume } */
let dirty = new Set(); /* which files need writing */
let host = null;
let iconIds = [];

const key = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const setKey = (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } };

/* ── is there an endpoint at all? ─────────────────────────────────────── */
export async function available() {
  try {
    const r = await fetch(API + 'ping', { cache: 'no-store' });
    return r.ok;
  } catch { return false; }
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
const mark = (file) => { dirty.add(file); paintBar(); };

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

function paintBar() {
  const bar = host?.querySelector('[data-abar]');
  if (!bar) return;
  bar.textContent = dirty.size
    ? `unsaved: ${[...dirty].join(', ')}`
    : 'saved';
  bar.classList.toggle('is-dirty', dirty.size > 0);
}

async function save() {
  const status = host.querySelector('[data-abar]');
  const files = { 'content.json': state.content, 'projects.json': state.projects, 'resume.json': state.resume };
  for (const f of [...dirty]) {
    status.textContent = `saving ${f}…`;
    const r = await fetch(API + f, {
      method: 'PUT',
      headers: { 'X-Admin-Key': key(), 'Content-Type': 'application/json' },
      body: JSON.stringify(files[f]),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      status.textContent = `FAILED on ${f}: ${out.error || r.status}`;
      status.classList.add('is-bad');
      return;
    }
    dirty.delete(f);
  }
  status.classList.remove('is-bad');
  paintBar();
  status.textContent = 'saved — reload to see it, then ./deploy.sh to publish';
}

function render() {
  const body = host.querySelector('[data-abody]');
  body.textContent = '';
  body.appendChild(TABS.find(([id]) => id === tab)[2]());
  [...host.querySelectorAll('[data-atab]')].forEach((b) => {
    b.classList.toggle('is-on', b.dataset.atab === tab);
  });
}

function shell() {
  const wrap = el('div', 'admin');
  const bar = el('header', 'admin__bar');
  bar.appendChild(el('strong', 'admin__title', 'Editor'));
  const tabs = el('nav', 'admin__tabs');
  for (const [id, label] of TABS) {
    const b = el('button', 'abtn', label);
    b.type = 'button'; b.dataset.atab = id;
    b.addEventListener('click', () => { tab = id; render(); });
    tabs.appendChild(b);
  }
  bar.appendChild(tabs);
  const status = el('span', 'admin__status', 'saved');
  status.dataset.abar = '';
  bar.appendChild(status);
  const saveBtn = el('button', 'abtn abtn--go', 'Save');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', save);
  bar.appendChild(saveBtn);
  const leave = el('a', 'abtn', 'Close');
  leave.href = '#/';
  bar.appendChild(leave);
  wrap.appendChild(bar);
  const body = el('div', 'admin__body');
  body.dataset.abody = '';
  wrap.appendChild(body);
  return wrap;
}

/* ── the password gate ─────────────────────────────────────────────────── */
function askPassword(onOk) {
  const wrap = el('div', 'admin admin--lock');
  const form = el('form', 'alock');
  form.appendChild(el('p', 'alock__t', 'Editor'));
  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'af__input';
  input.placeholder = 'password';
  input.autocomplete = 'current-password';
  form.appendChild(input);
  const err = el('p', 'alock__err');
  form.appendChild(err);
  const go = el('button', 'abtn abtn--go', 'Unlock');
  go.type = 'submit';
  form.appendChild(go);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    /* Verified by trying a real write the server can reject — there is no
       "check my password" endpoint, because that would be a free oracle. */
    const r = await fetch(API + 'content.json', {
      method: 'PUT',
      headers: { 'X-Admin-Key': input.value, 'Content-Type': 'application/json' },
      body: JSON.stringify(state.content),
    });
    if (r.ok) { setKey(input.value); onOk(); return; }
    err.textContent = 'Wrong password.';
    input.select();
  });
  wrap.appendChild(form);
  host.appendChild(wrap);
  input.focus();
}

export async function mount(node) {
  host = node;
  host.textContent = '';
  await load();
  const start = () => { host.textContent = ''; host.appendChild(shell()); render(); paintBar(); };
  if (key()) start(); else askPassword(start);
}

export function unmount() {
  if (host) host.textContent = '';
  dirty.clear();
}
