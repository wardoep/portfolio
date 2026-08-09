#!/usr/bin/env bash
# deploy.sh — check, commit, push. GitHub Pages serves the branch, so pushing
# IS the deploy; publish.sh only builds dist/ for local inspection.
#
# The site lives at https://penna.lol/ — a custom domain on this project's
# Pages site, set by the CNAME file in the repo root. That means it is served
# at a domain ROOT, not the old /portfolio/ subpath, which is why 404.html uses
# /assets/... and every absolute URL names penna.lol.
set -euo pipefail
cd "$(dirname "$0")"

./scripts/sync-projects.sh --check
./publish.sh

if [ -z "$(git status --porcelain)" ]; then
  echo "nothing to commit."
else
  git add -A
  git commit -m "${1:-Update portfolio}"
fi

git push -u origin main
echo
echo "pushed. Pages rebuilds in ~1 minute:"
echo "  https://penna.lol/"
echo
echo "check the build:"
echo "  gh api repos/wardoep/portfolio/pages/builds/latest --jq .status"
echo
echo "verify what actually went live (not what you think did):"
echo "  node tests/live.mjs"
