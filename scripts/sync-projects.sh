#!/usr/bin/env bash
# sync-projects.sh — pull public repos from GitHub into data/projects.json.
#
#   ./scripts/sync-projects.sh              merge and write
#   ./scripts/sync-projects.sh --dry-run    print the diff, write nothing
#   ./scripts/sync-projects.sh --check      exit 1 if stale, 2 if copy is unfinished
#   ./scripts/sync-projects.sh --user NAME  default wardoep
#
# THE RULE: every GitHub-derived field lives inside the `gh` object, and this
# script replaces `.gh` wholesale. Everything outside `gh` is hand-written and
# is never touched. That is the whole contract — one sentence, not a per-field
# allowlist that silently drifts the moment someone adds a field.
#
# --visibility public is MANDATORY, not tidiness. The gh token carries `repo`
# scope, so an unfiltered listing returns private repositories too, and would
# bake their names and descriptions into a file served publicly. Naming one of
# them here would do that job for it, which is why this comment does not.
set -euo pipefail
cd "$(dirname "$0")/.."

USER=wardoep
MODE=write
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE=dry ;;
    --check)   MODE=check ;;
    --user)    USER="$2"; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 64 ;;
  esac
  shift
done

OUT=data/projects.json
CACHE=data/.cache/gh-repos.json
mkdir -p data/.cache

command -v gh >/dev/null || { echo "gh not found" >&2; exit 69; }
command -v jq >/dev/null || { echo "jq not found" >&2; exit 69; }

gh repo list "$USER" \
  --visibility public \
  --source \
  --limit 200 \
  --json id,name,description,primaryLanguage,stargazerCount,pushedAt,createdAt,url,homepageUrl,isArchived,repositoryTopics,defaultBranchRef \
  > "$CACHE"

# Sanity gate. An expired token or a network blip returns [] or a short list,
# which would otherwise mark every project missing and blank the site.
N=$(jq 'length' "$CACHE")
[ "$N" -ge 5 ] || { echo "gh returned $N repos — refusing to sync" >&2; exit 75; }

python3 scripts/merge_projects.py "$CACHE" "$OUT" "$MODE"
RC=$?

if [ "$MODE" = write ] && [ -f "$OUT.tmp" ]; then
  mv "$OUT.tmp" "$OUT"           # atomic
  git --no-pager diff --stat -- "$OUT" 2>/dev/null || true
fi
rm -f "$OUT.tmp"
exit $RC
