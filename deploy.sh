#!/usr/bin/env bash
# deploy.sh — check, commit, push. GitHub Pages serves the branch, so pushing
# IS the deploy; publish.sh only builds dist/ for local inspection.
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
echo "pushed. Pages builds in ~1 minute (up to 10 on a brand-new site):"
echo "  https://wardoep.github.io/portfolio/"
echo
echo "check the build:"
echo "  gh api repos/wardoep/portfolio/pages/builds/latest --jq .status"
