#!/usr/bin/env node
/* make-og-card.mjs — render assets/img/og-card.png from the live data.
 *
 * The card is the first thing anyone sees: it is what renders when the link is
 * pasted into LinkedIn, a job application, or a recruiter's Slack. It used to
 * be a hand-made PNG, which meant it silently disagreed with the site the
 * moment a number changed — it claimed "20 documented labs" long after the
 * site had settled on thirteen.
 *
 * The card no longer states a count at all. Computing it instead of typing it
 * fixed the disagreement but not the actual problem: a preview image is cached
 * for weeks by every platform that scrapes it, so a number baked into one is
 * wrong the moment the next repo lands no matter how carefully it was derived.
 * The card says what the work is; the site says the same. publish.sh check 14
 * enforces that across every other piece of copy.
 *
 * The count is still computed, and only printed to the terminal — it is a
 * useful thing to see when you run this, and useless on the card.
 *
 *   node scripts/make-og-card.mjs
 *
 *   node scripts/make-og-card.mjs
 *
 * Needs a Chrome/Chromium with a debugging port already listening (the same
 * one the scratchpad suites use). CARD_PORT overrides the default.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CARD_PORT || 9224);
const OUT = join(ROOT, 'assets/img/og-card.png');

const doc = JSON.parse(readFileSync(join(ROOT, 'data/projects.json'), 'utf8'));

/* Labs are the security and infrastructure folders. The builds folder holds
   side projects, and counting those is what made the old number wrong. */
const LAB_FOLDERS = new Set(['security', 'infra']);
const labs = doc.projects.filter(
  (p) => LAB_FOLDERS.has(p.folder) && !p.hidden && p.status !== 'missing').length;

const b64 = (rel) => readFileSync(join(ROOT, rel)).toString('base64');
/* One @font-face per real weight. Declaring a single file as `400 900` makes
   the browser use the ExtraBold glyphs for every weight, so the role and school
   lines came out as heavy as the name. */
const font = (family, rel, weight) =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64(rel)}) format('woff2');` +
  `font-weight:${weight};font-style:normal;font-display:block}`;

const HTML = `<!doctype html><meta charset="utf-8"><style>
${font('Rounded', 'assets/fonts/MPLUSRounded1c-Regular.woff2', 400)}
${font('Rounded', 'assets/fonts/MPLUSRounded1c-ExtraBold.woff2', 800)}
${font('Pix', 'assets/fonts/DepartureMono-Regular.woff2', 400)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px}
body{
  background:#0d151c;
  background-image:radial-gradient(ellipse 80% 70% at 12% 0%, #16232e 0%, #0d151c 60%);
  font-family:Rounded,sans-serif;color:#e8ecf2;
  padding:84px;display:flex;flex-direction:column;justify-content:center;
}
.mark{font-family:Pix;font-size:76px;color:#35d6f5;letter-spacing:.06em;line-height:1;
      text-shadow:0 0 30px rgba(53,214,245,.45);margin-bottom:64px}
.name{font-size:88px;font-weight:800;letter-spacing:-.02em;line-height:1}
.role{font-size:40px;color:#a8b2c0;margin-top:18px;font-weight:400}
.edu{font-size:30px;color:#7d8796;margin-top:14px;font-weight:400}
.rule{flex:none;width:216px;height:4px;background:#35d6f5;border-radius:2px;margin:40px 0 26px}
.labs{font-family:Pix;font-size:27px;color:#a8b2c0;letter-spacing:.02em}
</style>
<div class="mark">EP</div>
<div class="name">Edward Penna</div>
<div class="role">Desktop Support / IT Support</div>
<div class="edu">B.S. Cybersecurity · SUNY Albany</div>
<div class="rule"></div>
<div class="labs">documented IT &amp; security labs</div>`;

/* ── drive the browser ─────────────────────────────────────────────────── */
const target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
  .find((t) => t.type === 'page');
if (!target) {
  console.error(`no page target on :${PORT} — start a headless browser with --remote-debugging-port=${PORT}`);
  process.exit(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((r) => { pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',
  { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
/* the card must not inherit whatever theme the last test left behind */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

await send('Page.navigate', { url: 'about:blank' });
await wait(120);
await send('Page.setDocumentContent', {
  frameId: (await send('Page.getFrameTree')).result.frameTree.frame.id,
  html: HTML,
});
/* font-display:block plus an explicit wait — a swap mid-capture would ship a
   card set in the fallback face */
await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
await wait(400);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
console.log(`og-card.png written — ${labs} labs, ${(readFileSync(OUT).length / 1024).toFixed(1)} KB`);
process.exit(0);
