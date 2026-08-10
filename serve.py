#!/usr/bin/env python3
"""Dev server that mounts the site at /portfolio/ — the same path GitHub Pages
will serve it from.

This is the single most useful file in the project. GitHub Pages serves a
project site from https://<user>.github.io/<repo>/, a SUBPATH. Serve from / in
development and an entire class of bugs — absolute asset paths, pathname-based
routing, a stray leading slash in CSS url() — stays invisible until production,
where the fix cycle is a push plus a ten-minute CDN wait.

So: http://localhost:8091/portfolio/  and a redirect from / so you can't
accidentally test the wrong thing.

Port 8091 because 8090 is newsite, and 8080 is the osTicket container.
"""
import argparse
import hmac
import json
import os
import subprocess
import sys
from functools import partial
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from socket import socket, AF_INET, SOCK_STREAM

ROOT = Path(__file__).resolve().parent
MOUNT = "/portfolio"
DEFAULT_PORT = 8091

# Never serve these, even locally — it keeps the dev server honest about what
# the published site actually contains.
BLOCKED = (".git", "scripts", "notes", "data/.cache", "serve.py", "publish.sh", "deploy.sh")

# ── the admin write endpoint ────────────────────────────────────────────────
# Off unless --admin is passed, and then bound to 127.0.0.1 only. This is the
# ONLY thing that can change the site's content from a browser, which is why the
# password is enforced here and not in the editor: a client-side check is
# theatre, since anyone can curl the endpoint directly.
#
# The site published to penna.lol has no such endpoint, so the admin panel there
# cannot mount at all. There is nothing to guess, steal, or leave logged in.
ADMIN_PREFIX = "__admin/"
PW_FILE = ROOT / ".admin-pw"

# An allowlist, not a path check. "is it under data/" invites ../ games and
# depends on getting normalisation exactly right; naming the three files does not.
WRITABLE = {
    "content.json": ROOT / "data" / "content.json",
    "resume.json": ROOT / "data" / "resume.json",
    "projects.json": ROOT / "data" / "projects.json",
}
# Which generator to run after which file lands.
BAKERS = {
    "content.json": ["scripts/bake-panels.mjs"],
    "resume.json": ["scripts/bake-resume.mjs"],
    "projects.json": [],
}


def load_password():
    """Read .admin-pw. Refuses to start without it, and does NOT invent a
    default — a default would have to be written here, and this file is tracked
    in a public repository, so it would be a label rather than a password.

    publish.sh check 17 enforces that: it reads the value from .admin-pw and
    fails the build if it appears in anything tracked. It caught this exact
    mistake when the constant lived a few lines above."""
    if not PW_FILE.exists():
        sys.exit(
            f"--admin needs {PW_FILE.name}, which is gitignored and deliberately\n"
            f"not in the repository. Create it once:\n\n"
            f"    printf 'your-password\\n' > {PW_FILE.name} && chmod 600 {PW_FILE.name}\n"
        )
    pw = PW_FILE.read_text().strip()
    if not pw:
        sys.exit(f"{PW_FILE.name} is empty")
    return pw


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".woff2": "font/woff2",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".pdf": "application/pdf",
    }

    def translate_path(self, path):
        # Strip the mount prefix before handing off to the stdlib resolver.
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith(MOUNT):
            path = clean[len(MOUNT):] or "/"
        return super().translate_path(path)

    def _rel(self):
        p = self.path.split("?", 1)[0].split("#", 1)[0]
        if p.startswith(MOUNT):
            p = p[len(MOUNT):]
        return p.lstrip("/")

    # ── admin ──────────────────────────────────────────────────────────────
    def _authorised(self):
        """compare_digest, not ==. A plain comparison returns early on the first
        wrong byte, so response timing leaks the password one character at a
        time. Over loopback that is a stretch, but the fix is one function."""
        want = getattr(self.server, "admin_pw", None)
        if not want:
            return False
        got = self.headers.get("X-Admin-Key", "")
        return hmac.compare_digest(got, want)

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        rel = self._rel()
        if not getattr(self.server, "admin", False) or not rel.startswith(ADMIN_PREFIX):
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return
        if not self._authorised():
            # 403, not 401: there is no auth scheme to negotiate, and a browser
            # popping a basic-auth dialog here would be worse than useless.
            self._json(HTTPStatus.FORBIDDEN, {"error": "bad or missing admin key"})
            return

        name = rel[len(ADMIN_PREFIX):]
        target = WRITABLE.get(name)
        if target is None:
            self._json(HTTPStatus.BAD_REQUEST, {"error": f"not writable: {name}"})
            return

        raw = self.rfile.read(int(self.headers.get("Content-Length", 0) or 0))
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            # Refuse BEFORE touching the file. A half-written or invalid
            # content.json takes the whole site down, and the editor is the one
            # thing on this machine allowed to write it.
            self._json(HTTPStatus.BAD_REQUEST, {"error": f"not valid JSON: {e}"})
            return

        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_text(json.dumps(parsed, indent=2, ensure_ascii=False) + "\n")
        tmp.replace(target)                       # atomic

        baked = []
        for script in BAKERS[name]:
            r = subprocess.run(["node", script], cwd=ROOT, capture_output=True, text=True)
            baked.append(r.stdout.strip() or r.stderr.strip())
            if r.returncode != 0:
                self._json(HTTPStatus.INTERNAL_SERVER_ERROR,
                           {"error": "saved, but the bake failed", "detail": baked})
                return

        self._json(HTTPStatus.OK, {"ok": True, "wrote": str(target.relative_to(ROOT)), "baked": baked})

    def do_GET(self):
        raw = self.path.split("?", 1)[0].split("#", 1)[0]

        # The editor probes this to decide whether to mount at all. On the
        # published site it does not exist, so the admin route does nothing.
        if self._rel() == ADMIN_PREFIX + "ping":
            if not getattr(self.server, "admin", False):
                self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
                return
            self._json(HTTPStatus.OK, {"admin": True})
            return

        # / -> /portfolio/  so you always test the real path
        if raw in ("", "/"):
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", MOUNT + "/")
            self.end_headers()
            return

        # /portfolio -> /portfolio/  (Pages does this too; without the slash,
        # relative asset paths resolve one level too high)
        if raw == MOUNT:
            self.send_response(HTTPStatus.MOVED_PERMANENTLY)
            self.send_header("Location", MOUNT + "/")
            self.end_headers()
            return

        if not raw.startswith(MOUNT):
            self.send_error(HTTPStatus.NOT_FOUND,
                            f"site is mounted at {MOUNT}/ — try http://localhost:{self.server.server_port}{MOUNT}/")
            return

        rel = self._rel()
        if rel.startswith(BLOCKED):
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        # Serve 404.html like Pages does, so it gets exercised in dev.
        target = ROOT / rel
        if rel and not target.exists() and not rel.endswith("/"):
            page = ROOT / "404.html"
            if page.exists():
                body = page.read_bytes()
                self.send_response(HTTPStatus.NOT_FOUND)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        super().do_GET()

    def end_headers(self):
        # Pages caches for ~10 minutes and you cannot change it; locally we want
        # the opposite, so a reload always shows the edit you just made.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def busy(port):
    with socket(AF_INET, SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main():
    ap = argparse.ArgumentParser(description="serve the portfolio at /portfolio/")
    ap.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT)
    ap.add_argument("--admin", action="store_true",
                    help="enable the editor's write endpoint (localhost only)")
    args = ap.parse_args()

    if busy(args.port):
        sys.exit(f"port {args.port} is already listening — pick another, e.g. ./serve.sh {args.port + 1}")

    os.chdir(ROOT)
    # Threading, not plain HTTPServer. Single-threaded, one slow or half-open
    # connection blocks every other request, and a browser opening several in
    # parallel fills the accept backlog and wedges the server completely — it
    # keeps listening while answering nothing, which looks exactly like a crash.
    # 0.0.0.0 normally, so a phone on the LAN or a forwarded port can reach the
    # preview. NOT in admin mode: the write endpoint binds to loopback only, so
    # the editor is unreachable from anything but this machine. The password is
    # the second lock, not the first.
    host = "127.0.0.1" if args.admin else "0.0.0.0"
    httpd = ThreadingHTTPServer((host, args.port), partial(Handler, directory=str(ROOT)))
    httpd.daemon_threads = True
    httpd.admin = args.admin
    httpd.admin_pw = load_password() if args.admin else None
    url = f"http://localhost:{args.port}{MOUNT}/"
    print(f"serving {ROOT}")
    print(f"  -> {url}")
    if args.admin:
        print(f"  -> {url}#/admin   (editor on — bound to 127.0.0.1 only)")
    else:
        print(f"  -> http://<this-host>:{args.port}{MOUNT}/   (LAN / forwarded port)")
    print("  ctrl-c to stop\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
