#!/usr/bin/env bash
# deploy.sh — check, commit, push. Vercel builds from the pushed commit, so
# pushing IS the deploy; publish.sh only builds dist/ for local inspection.
#
# There is no build step and no Vercel CLI in the loop on purpose: the project
# is served exactly as it sits in the repo, which is the whole reason publish.sh
# can assert what production serves by reading these files.
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
echo "pushed. Vercel deploys in ~20 seconds:"
echo "  https://penna.lol/"
echo
echo "verify what actually went live (not what you think did):"
echo "  node tests/live.mjs"
