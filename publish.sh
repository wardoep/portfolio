#!/usr/bin/env bash
# publish.sh — pre-flight checks, then a dist/ copy of exactly what Pages serves.
#
# This is NOT the deploy step. Pages deploys from the branch, so what you commit
# is what ships. dist/ exists only so you can eyeball the published tree, and
# the checks exist because every one of them corresponds to a bug that is
# invisible locally and obvious in production.
set -euo pipefail
cd "$(dirname "$0")"

fail=0
note() { printf '  %-8s %s\n' "$1" "$2"; }
bad()  { note "FAIL" "$1"; fail=1; }
ok()   { note "ok" "$1"; }

echo "pre-flight"

# 1 — absolute asset paths. On a subpath these resolve to the domain root and
#     404. 404.html is the one legitimate exception (see the comment in it).
if grep -nE '(href|src)="/[^/]' index.html resume.html assets/css/*.css assets/js/*.js 2>/dev/null; then
  bad "absolute asset path — must be relative on a /portfolio/ subpath"
else
  ok "no absolute asset paths"
fi

# 2 — a <base> tag would rebase <use href="#icon"> and silently blank the sprite
if grep -qi '<base' index.html resume.html 2>/dev/null; then
  bad "<base> tag present — it will blank every inline SVG icon"
else
  ok "no <base> tag"
fi

# 3 — Pages runs on Linux; a case-only collision works locally and 404s live
dupes=$(find . -path ./.git -prune -o -type f -print | tr 'A-Z' 'a-z' | sort | uniq -d)
if [ -n "$dupes" ]; then bad "case-only filename collision: $dupes"; else ok "no case collisions"; fi

# 4 — Jekyll would refuse to publish _-prefixed paths and dies on stray Liquid
[ -f .nojekyll ] && ok ".nojekyll present" || bad ".nojekyll missing"

# 5 — the trademark rule from notes/LEGAL.md, enforced rather than remembered
if grep -rniE 'nintendo|wii|miiverse|\bmii\b' index.html resume.html 404.html assets/ data/ 2>/dev/null; then
  bad "console trademark in shipped content"
else
  ok "no console trademarks in shipped files"
fi

# 6 — personal details that must never reach a public, permanently-archived URL.
#     The patterns are split so this script does not match itself.
LEAK="721-797[1]|yaho[o]\.com|St Jame[s]"
if grep -rnE "$LEAK" . --exclude-dir=.git --exclude-dir=dist --exclude=publish.sh 2>/dev/null; then
  bad "personal contact detail found"
else
  ok "no leaked personal details"
fi

# 7 — data freshness and copy completeness
./scripts/sync-projects.sh --check >/dev/null 2>&1 \
  && ok "projects.json current, all blurbs written" \
  || bad "projects.json stale or a visible project has no blurb — run scripts/sync-projects.sh"

# 8 — contrast, computed through the tint blend
node scripts/check-contrast.mjs >/dev/null 2>&1 \
  && ok "contrast passes under the tint" \
  || bad "contrast below threshold — run node scripts/check-contrast.mjs"

# 9 — every icon referenced actually exists in the sprite
missing=""
for id in $(grep -ohE "href=[\"']#i-[a-z-]+" index.html assets/js/*.js | sed 's/.*#//' | sort -u); do
  grep -q "id=\"$id\"" index.html || missing="$missing $id"
done
for id in $(grep -ohE "'i-[a-z-]+'" assets/js/*.js data/projects.json 2>/dev/null | tr -d "'" | sort -u); do
  grep -q "id=\"$id\"" index.html || missing="$missing $id"
done
# Channel icons were never checked — the grid's three tiles got their icons
# validated only by luck. `// []` matters: a bare .channels[] on a missing key
# makes jq error, the loop gets nothing, $missing stays empty, and the check
# passes silently, which is worse than not having it.
for id in $(jq -r '.projects[].icon, .folders[].icon, (.channels // [])[].icon' data/projects.json | sort -u); do
  grep -q "id=\"i-$id\"" index.html || missing="$missing i-$id"
done
missing=$(echo "$missing" | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs || true)
[ -z "$missing" ] && ok "every referenced icon exists" || bad "icon not in sprite:$missing"

# 10 — the sprite is drawn in a 24-unit space; a consuming svg without a viewBox
#      clips small icons to their top-left corner instead of scaling them
if grep -oE '<svg class="ico[^"]*"[^>]*>' index.html | grep -qv viewBox; then
  bad "an .ico svg has no viewBox — small icons will render clipped"
else
  ok "every .ico svg carries a viewBox"
fi

# 11 — every screenshot referenced in the data is actually on disk, and carries
#      a real alt sentence. A typo'd filename would otherwise ship as a broken
#      image icon in the middle of the evidence section, which is worse than
#      having no evidence at all.
shotmiss=""
for f in $(jq -r '[.projects[].shots // []] | flatten | .[].src' data/projects.json 2>/dev/null); do
  [ -f "assets/img/shots/$f" ] || shotmiss="$shotmiss $f"
done
noalt=$(jq -r '[.projects[].shots // []] | flatten | map(select((.alt // "") | length < 12)) | length' data/projects.json 2>/dev/null || echo 0)
if [ -n "$shotmiss" ]; then
  bad "screenshot referenced but not on disk:$shotmiss"
elif [ "${noalt:-0}" != "0" ]; then
  bad "$noalt screenshot(s) have no usable alt text"
else
  nshots=$(jq -r '[.projects[].shots // []] | flatten | length' data/projects.json 2>/dev/null || echo 0)
  ok "every screenshot exists and is described ($nshots on file)"
fi

# 12 — the PDF must be derived from the resume.html this build just checked.
#      Grepping a PDF's text needs a tool that is not guaranteed to be here, and
#      it would only prove the text looks clean. Provenance is stronger: the
#      sidecar pins the SHA of the source file, and check 6 has already read
#      that file for the phone number, home locality and old address. A PDF
#      exported by hand from a word processor carries all three plus whatever
#      the document properties say, which is why one is not committed here.
if [ -f assets/doc/resume.pdf ]; then
  want=$(sha256sum resume.html | cut -d' ' -f1)
  got=$(cat assets/doc/resume.pdf.source 2>/dev/null | tr -d '[:space:]')
  if [ "$want" = "$got" ]; then
    ok "resume.pdf was rendered from this resume.html"
  else
    bad "resume.pdf is stale — run: node scripts/make-resume-pdf.mjs"
  fi
else
  ok "no resume.pdf to verify"
fi

# 13 — a forward-looking date that has quietly gone past. The site promised
#      "CompTIA Network+ scheduled July 2026" in five places and was still
#      saying it in August, which a recruiter reads as either he didn't sit it
#      or he doesn't maintain his own site. Nothing catches that by eye,
#      because the sentence is still perfectly well-formed.
stale=$(python3 - <<'PY'
import re, sys, datetime, pathlib
MONTHS = {m: i for i, m in enumerate(
    "january february march april may june july august september october "
    "november december".split(), 1)}
today = datetime.date.today()
pat = re.compile(
    r"(scheduled|sitting|upcoming|due|expected|starting)\b[^.<]{0,60}?"
    r"\b(" + "|".join(MONTHS) + r")\s+(\d{4})", re.I)
bad = []
for f in ("index.html", "resume.html", "404.html"):
    p = pathlib.Path(f)
    if not p.exists():
        continue
    for m in pat.finditer(p.read_text()):
        when = datetime.date(int(m.group(3)), MONTHS[m.group(2).lower()], 1)
        # the month itself is generous: a date is only stale once it is over
        if when < today.replace(day=1):
            bad.append(f"{f}: {m.group(0).strip()}")
print("\n".join(bad))
PY
)
if [ -n "$stale" ]; then
  bad "a future date has gone past: $(echo "$stale" | head -1)"
else
  ok "no forward-looking date has expired"
fi

echo
[ "$fail" -eq 0 ] || { echo "pre-flight failed."; exit 1; }

# ── build the tree Pages will serve, for local inspection ────────────────
rm -rf dist
mkdir -p dist/portfolio
cp index.html 404.html resume.html .nojekyll dist/portfolio/
cp -r assets dist/portfolio/
mkdir -p dist/portfolio/data
cp data/projects.json dist/portfolio/data/

# cache-bust: Pages caches for ~10 minutes and the header cannot be changed
STAMP=$(git log -1 --format=%h 2>/dev/null || echo dev)
# delimiter is # — the pattern itself contains | alternation
sed -i -E "s#(assets/(css|js)/[a-z-]+\.(css|js))\"#\1?v=$STAMP\"#g" dist/portfolio/index.html

echo "built dist/portfolio  ($(du -sh dist/portfolio | cut -f1), stamp $STAMP)"
echo "serve it with ./serve.sh and open http://localhost:8091/portfolio/"
