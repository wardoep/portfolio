#!/usr/bin/env bash
# serve.sh — thin wrapper around serve.py.
#
#   ./serve.sh          -> http://localhost:8091/portfolio/
#   ./serve.sh 8092     -> pick another port
#
# The site is mounted at /portfolio/ on purpose: that is the path GitHub Pages
# serves a project site from, and testing at / hides every subpath bug until
# production. serve.py refuses to start on a port that is already listening.
set -euo pipefail
cd "$(dirname "$0")"
exec python3 serve.py "$@"
