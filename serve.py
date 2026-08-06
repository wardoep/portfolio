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
import os
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

    def do_GET(self):
        raw = self.path.split("?", 1)[0].split("#", 1)[0]

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
    args = ap.parse_args()

    if busy(args.port):
        sys.exit(f"port {args.port} is already listening — pick another, e.g. ./serve.sh {args.port + 1}")

    os.chdir(ROOT)
    # Threading, not plain HTTPServer. Single-threaded, one slow or half-open
    # connection blocks every other request, and a browser opening several in
    # parallel fills the accept backlog and wedges the server completely — it
    # keeps listening while answering nothing, which looks exactly like a crash.
    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), partial(Handler, directory=str(ROOT)))
    httpd.daemon_threads = True
    url = f"http://localhost:{args.port}{MOUNT}/"
    print(f"serving {ROOT}")
    print(f"  -> {url}")
    print(f"  -> http://<this-host>:{args.port}{MOUNT}/   (LAN / forwarded port)")
    print("  ctrl-c to stop\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
