/* gh.js — commit to the repository from a browser.
 *
 * Used only when the editor is running on penna.lol. At the desk it talks to
 * serve.py instead, which needs no credential at all and is strictly the safer
 * path; this is what makes "edit from anywhere" possible.
 *
 * ONE COMMIT, NOT THREE. The obvious approach — PUT each file through the
 * Contents API — makes a separate commit per file and, worse, leaves the repo
 * in a state where content.json has been updated but index.html has not. Pages
 * would rebuild in between and serve a half-applied edit. So this uses the Git
 * Data API: blobs, one tree, one commit, one ref update. Either everything
 * lands or nothing does.
 *
 * THE TOKEN NEVER SITS IN PLAIN TEXT. It is encrypted with the password using
 * WebCrypto — PBKDF2 to derive a key, AES-GCM to seal it — so what is in
 * localStorage is useless without the password. That is what makes the password
 * do real work rather than decorate a credential anyone could read out of
 * devtools.
 */

const OWNER = 'wardoep';
const REPO = 'portfolio';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const VAULT = 'pf-admin-vault';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    /* 310k iterations is OWASP's floor for PBKDF2-SHA256. It costs a beat on
       unlock and makes a stolen vault expensive to grind. */
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function saveToken(token, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
  localStorage.setItem(VAULT, JSON.stringify({
    v: 1, salt: b64(salt), iv: b64(iv), data: b64(sealed),
  }));
}

export const hasToken = () => !!localStorage.getItem(VAULT);
export const forgetToken = () => localStorage.removeItem(VAULT);

/* Returns the token, or null if the password is wrong. AES-GCM is
   authenticated, so a wrong key fails to decrypt rather than returning
   plausible rubbish — the password check and the unseal are the same act. */
export async function unlock(password) {
  const raw = localStorage.getItem(VAULT);
  if (!raw) return null;
  try {
    const { salt, iv, data } = JSON.parse(raw);
    const key = await keyFrom(password, unb64(salt));
    const out = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data));
    return dec.decode(out);
  } catch { return null; }
}

/* ── the API ───────────────────────────────────────────────────────────── */
const hdrs = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function call(token, path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { ...hdrs(token), ...(init.headers || {}) } });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    /* 401/403 here almost always means the token expired or was scoped to the
       wrong repository, which is worth saying out loud rather than showing a
       bare status code. */
    const hint = r.status === 401 || r.status === 403
      ? ' — the token may have expired, or it is not scoped to this repository with Contents: read and write'
      : '';
    throw new Error(`GitHub ${r.status}${hint}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  return r.status === 204 ? null : r.json();
}

/* Who the token belongs to — and, more importantly, how much it can do.
 *
 * /user succeeds for EVERY token GitHub issues, so "it worked" said nothing at
 * all about blast radius. The gate accepted anything this call did not reject,
 * which meant a classic PAT carrying `repo` — read and write on every private
 * repository the account can reach — was sealed into a browser vault on a
 * public website, and the only hint that this was wrong was a sentence in the
 * paste field asking nicely for something narrower.
 *
 * A classic PAT announces its scopes in a response header. A fine-grained one
 * sends nothing there, which is exactly the case we want, so an empty header is
 * a pass and a populated one is refused by name. */
const WIDE = /^(repo|admin:|delete_repo|workflow|write:org|user|gist)/;

export async function whoami(token) {
  const r = await fetch('https://api.github.com/user', { headers: hdrs(token) });
  if (!r.ok) throw new Error(`that token was rejected (${r.status})`);

  const scopes = (r.headers.get('x-oauth-scopes') || '').split(/,\s*/).filter(Boolean);
  const wide = scopes.filter((s) => WIDE.test(s));
  if (wide.length) {
    throw new Error(
      `that token carries ${wide.join(', ')} — far more than this needs, and it is about ` +
      `to be stored in a browser. Make a fine-grained token limited to ${OWNER}/${REPO} ` +
      `with Contents: read and write, and paste that instead.`);
  }

  /* And prove it can actually write HERE, rather than discovering it cannot at
     commit time with a half-finished edit on screen. */
  const repo = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: hdrs(token) });
  if (!repo.ok) throw new Error(`that token cannot see ${OWNER}/${REPO} (${repo.status})`);
  if (!(await repo.json()).permissions?.push) {
    throw new Error(`that token can read ${OWNER}/${REPO} but not write to it`);
  }
  return (await r.json()).login;
}

export async function readFile(token, path) {
  const j = await call(token, `/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
  /* base64 with newlines, and the content may be UTF-8. atob gives bytes; run
     them back through TextDecoder or every é and — comes out mangled. */
  const bytes = unb64(j.content.replace(/\n/g, ''));
  return dec.decode(bytes);
}

/* files: { path: contentString }. One commit for all of them. */
export async function commit(token, files, message) {
  const ref = await call(token, `/git/ref/heads/${BRANCH}`);
  const head = ref.object.sha;
  const base = await call(token, `/git/commits/${head}`);

  const blobs = [];
  for (const [path, content] of Object.entries(files)) {
    /* Send base64 rather than utf-8: the API's utf-8 mode is fussy about lone
       surrogates and this content is full of é, — and ’. */
    const b = await call(token, '/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: b64(enc.encode(content)), encoding: 'base64' }),
    });
    blobs.push({ path, mode: '100644', type: 'blob', sha: b.sha });
  }

  const tree = await call(token, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: base.tree.sha, tree: blobs }),
  });
  const made = await call(token, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
  });
  await call(token, `/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    /* No force. If someone else pushed while the editor was open, this fails
       rather than throwing their commit away — reload and redo is a far better
       outcome than a silent overwrite. */
    body: JSON.stringify({ sha: made.sha, force: false }),
  });
  return made.sha;
}
