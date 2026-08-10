#!/usr/bin/env bash
# run.sh — start a server and a headless browser, run every suite, tear down.
#
# The suites used to live in a scratch directory and were deleted by a cleanup
# between sessions, taking every gate with them. They are in the repo now, and
# this script is what makes them runnable without remembering three flags.
#
#   ./tests/run.sh              everything
#   ./tests/run.sh fit perf     just those
#
# Leaves an already-running server or browser alone, so you can keep a browser
# open and re-run a single suite against it.
set -uo pipefail
cd "$(dirname "$0")/.."

PORT=8091
CDP=9224
STARTED_SERVER=0
STARTED_BROWSER=0

up() { curl -s -o /dev/null --max-time 2 "$1" 2>/dev/null; }

if ! up "http://127.0.0.1:$PORT/portfolio/"; then
  setsid nohup python3 serve.py "$PORT" >/tmp/pf-serve.log 2>&1 </dev/null &
  STARTED_SERVER=1
  for _ in $(seq 20); do up "http://127.0.0.1:$PORT/portfolio/" && break; sleep .3; done
fi

if ! up "http://127.0.0.1:$CDP/json/version"; then
  # Any Chromium will do. The headless shell is smaller and is what CI has.
  SHELL_BIN=$(command -v chromium || command -v google-chrome || \
    find /mnt/hermes/caches /root/.cache "$HOME/.cache" -name 'chrome-headless-shell' -type f 2>/dev/null | head -1)
  if [ -z "${SHELL_BIN:-}" ]; then
    echo "No Chromium found. Install one, or point CDP_PORT at a running browser." >&2
    exit 69
  fi
  setsid nohup "$SHELL_BIN" --remote-debugging-port=$CDP --remote-allow-origins='*' \
    --user-data-dir=/tmp/pf-chrome --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1440,900 about:blank \
    >/tmp/pf-chrome.log 2>&1 </dev/null &
  STARTED_BROWSER=1
  for _ in $(seq 30); do up "http://127.0.0.1:$CDP/json/version" && break; sleep .3; done
fi

SUITES=("$@")
# admin is NOT in the default set: it needs the write endpoint, which means a
# second server started with --admin, and it edits real files. Run it on purpose:
#   python3 serve.py 8099 --admin &
#   PF_BASE=http://127.0.0.1:8099/portfolio/ node tests/admin-test.mjs
[ ${#SUITES[@]} -eq 0 ] && SUITES=(flicker chrome fit perf)

fail=0
for s in "${SUITES[@]}"; do
  f="tests/${s%-test}-test.mjs"
  [ -f "$f" ] || f="tests/$s.mjs"
  [ -f "$f" ] || { echo "  no such suite: $s"; fail=1; continue; }
  printf '%-14s ' "$s"
  out=$(node "$f" 2>&1)
  if echo "$out" | grep -q 'failed\.'; then
    echo "FAILED"
    echo "$out" | grep -E '^\s+FAIL' | sed 's/^/    /'
    fail=1
  else
    echo "green ($(echo "$out" | grep -c PASS) checks)"
  fi
done

# Only clean up what this run started.
[ "$STARTED_BROWSER" = 1 ] && pkill -f "remote-debugging-port=$CDP" 2>/dev/null
[ "$STARTED_SERVER" = 1 ] && pkill -f "serve.py $PORT" 2>/dev/null

echo
[ "$fail" -eq 0 ] && echo "all suites green." || { echo "suites failed."; exit 1; }
