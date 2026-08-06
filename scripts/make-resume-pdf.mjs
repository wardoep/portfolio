#!/usr/bin/env node
/* make-resume-pdf.mjs — render assets/doc/resume.pdf from resume.html.
 *
 * Half the managers who reach a résumé page want to save it or forward it, and
 * "Ctrl+P, save as PDF" is friction you are imposing on the person deciding
 * whether to interview you.
 *
 * It is generated from resume.html and from nothing else. That is the whole
 * safety argument: resume.html carries no phone number, no home locality and no
 * old address, and publish.sh check 6 greps it for exactly those on every
 * build. A hand-made PDF exported from a word processor would carry all three
 * plus whatever the document properties happen to say — which is precisely why
 * the existing one is not in this repo.
 *
 * A sidecar records the SHA-256 of the resume.html it was rendered from, and
 * publish.sh refuses to ship a PDF whose sidecar does not match. That is a
 * stronger guarantee than grepping the PDF's text: it proves the bytes came
 * from a file that the PII gate has already read.
 *
 *   ./serve.sh &  &&  node scripts/make-resume-pdf.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CARD_PORT || 9224);
const URL_ = process.env.PURL || 'http://127.0.0.1:8091/portfolio/resume.html';
const OUT = join(ROOT, 'assets/doc/resume.pdf');
const SIDECAR = OUT + '.source';

const html = readFileSync(join(ROOT, 'resume.html'));
const sha = createHash('sha256').update(html).digest('hex');

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
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

/* Emulate DARK on purpose. The print stylesheet forces light-on-white, so
   rendering from a dark screen is the case that would produce a résumé printed
   white-on-black — if that rule ever regresses, this is where it shows up. */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await send('Page.navigate', { url: 'about:blank' });
await wait(150);
await send('Page.navigate', { url: URL_ });
await send('Page.reload', { ignoreCache: true });
await wait(1800);

const res = await send('Page.printToPDF', {
  printBackground: false,          /* the print rule is already light-on-white */
  paperWidth: 8.5, paperHeight: 11,
  marginTop: 0.5, marginBottom: 0.5, marginLeft: 0.5, marginRight: 0.5,
  preferCSSPageSize: false,
});
if (!res.result?.data) {
  console.error('printToPDF returned nothing:', JSON.stringify(res).slice(0, 300));
  process.exit(1);
}

mkdirSync(join(ROOT, 'assets/doc'), { recursive: true });
const pdf = Buffer.from(res.result.data, 'base64');
writeFileSync(OUT, pdf);
writeFileSync(SIDECAR, sha + '\n');
console.log(`resume.pdf written — ${(pdf.length / 1024).toFixed(1)} KB, from resume.html ${sha.slice(0, 12)}`);
process.exit(0);
