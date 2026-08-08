/* cdp.mjs — the shared test harness.
 *
 * These suites lived in a scratch directory for weeks and were deleted by a
 * cleanup between sessions, taking every gate with them. They have caught five
 * real regressions in this project — a selector that made twenty panels
 * unreachable, a box-shadow transition that halved the frame rate, an entrance
 * animation playing behind an opaque overlay, focus falling to <body>, and a
 * bottom bar 80px off centre. Losing them costs more than the disk they take,
 * so they live in the repo now.
 *
 * No playwright: this drives a headless shell over the DevTools protocol with
 * a raw WebSocket, which is one dependency instead of a browser download.
 *
 *   ./tests/run.sh              start the server and browser, run everything
 *   node tests/fit-test.mjs     one suite, against an already-running pair
 *
 * The one non-obvious thing is load(). Navigating to a URL that differs only by
 * #hash is a SAME-DOCUMENT navigation: the document and its stylesheets are
 * never re-fetched, so an edited CSS file silently measures as the old one and
 * the suite reports a cheerful false pass. about:blank first, then a
 * cache-ignoring reload, is what makes the measurement real.
 */
export const PORT = Number(process.env.CDP_PORT || 9224);
export const BASE = process.env.PF_BASE || 'http://127.0.0.1:8091/portfolio/';

export async function connect({ width = 1440, height = 900, dpr = 1 } = {}) {
  let list;
  try {
    list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  } catch {
    console.error(`\nNo browser on :${PORT}. Start one with ./tests/run.sh, ` +
                  `or set CDP_PORT.\n`);
    process.exit(2);
  }
  const target = list.find((t) => t.type === 'page');
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
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Every uncaught exception and console error, collected. A syntax error in
     one module makes site.js fail to import and the whole page renders empty —
     which shows up in the suites as dozens of unrelated failures and sends you
     hunting in the wrong file. */
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(d.exception?.description || d.text || 'exception');
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.description || a.value).join(' '));
    }
  });

  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: dpr, mobile: width < 500 });

  const load = async (hash = '', settle = 2000) => {
    await send('Page.navigate', { url: 'about:blank' });
    await wait(120);
    /* Cleared HERE, not at connect(): navigating away aborts site.js's
       in-flight fetch of projects.json, and its catch logs a "Failed to fetch"
       that belongs to the page being torn down, not the one being measured. */
    errors.length = 0;
    await send('Page.navigate', { url: BASE + hash });
    await send('Page.reload', { ignoreCache: true });
    await wait(settle);
    /* Every suite except the boot one wants the menu, not the start screen. */
    await ev(`sessionStorage.setItem('pf-booted', '1')`).catch(() => {});
    await ev(`document.querySelector('[data-boot]')?.setAttribute('hidden','')`).catch(() => {});
  };

  const key = async (k, code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };

  const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride',
    { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });

  return {
    ws, send, ev, wait, load, key, viewport, errors,
    escape: () => key('Escape', 'Escape', 27),
    count: (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    openPanel: () => ev(`document.querySelector('.panel:not([hidden])')?.id || 'none'`),
  };
}

export function reporter() {
  let fail = 0;
  const check = (name, ok, detail = '') => {
    if (!ok) fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  };
  const done = (msg) => {
    if (fail) { console.error(`\n${fail} check(s) failed.`); process.exit(1); }
    console.log(`\n${msg}`);
    process.exit(0);
  };
  return { check, done, failures: () => fail };
}
