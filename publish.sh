#!/usr/bin/env bash
# publish.sh — pre-flight checks, then a dist/ copy of exactly what ships.
#
# This is NOT the deploy step. Vercel builds from the pushed commit, so what you
# commit is what ships. dist/ exists only so you can eyeball the published tree,
# and the checks exist because every one of them corresponds to a bug that is
# invisible locally and obvious in production.
set -euo pipefail
cd "$(dirname "$0")"

fail=0
note() { printf '  %-8s %s\n' "$1" "$2"; }
bad()  { note "FAIL" "$1"; fail=1; }
ok()   { note "ok" "$1"; }

echo "pre-flight"

# 1 — absolute asset paths. Kept relative even though the site now lives at a
#     domain root and `/assets/...` would resolve fine there: relative paths
#     work at BOTH, so a preview deployment on a *.vercel.app subpath, a local
#     server mounted anywhere, and the domain root all behave the same.
#     404.html is the one legitimate exception (see the comment in it).
if grep -nE '(href|src)="/[^/]' index.html resume.html assets/css/*.css assets/js/*.js 2>/dev/null; then
  bad "absolute asset path — keep these relative so previews work too"
else
  ok "no absolute asset paths"
fi

# 2 — a <base> tag would rebase <use href="#icon"> and silently blank the sprite
if grep -qi '<base' index.html resume.html 2>/dev/null; then
  bad "<base> tag present — it will blank every inline SVG icon"
else
  ok "no <base> tag"
fi

# 3 — the CDN runs on Linux; a case-only collision works locally and 404s live
dupes=$(find . -path ./.git -prune -o -type f -print | tr 'A-Z' 'a-z' | sort | uniq -d)
if [ -n "$dupes" ]; then bad "case-only filename collision: $dupes"; else ok "no case collisions"; fi

# 4 — Jekyll would refuse to publish _-prefixed paths and dies on stray Liquid.
#     Vercel does not run Jekyll, but GitHub Pages is still serving the old URL
#     as a fallback, so this stays until that is switched off.
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

# 14 — copy that has to be maintained by hand every time a repo is pushed.
#
#      Nine places shipped a hard count — "thirteen labs", "six builds", "13
#      entries" — plus a "built by hand" claim. Every one of those is a line
#      that silently becomes a lie the next time he pushes, and none of them
#      look wrong while they are still true, which is exactly why this has to
#      be a check rather than a resolution.
#
#      It is also a claim he does not want the site making on his behalf: the
#      site should say what the work IS, never how much of it there is.
#
#      Scope is deliberately prose only. Comments in source, the project data
#      (a blurb that genuinely says "six alert channels" is describing a
#      feature, not counting a portfolio), and this file are all exempt —
#      a gate that flags legitimate text is a gate people learn to skip.
countable=$(python3 - <<'PY'
import re, pathlib, html

NUM = (r"(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
       r"thirteen|fourteen|fifteen|twenty|dozen|several|many|numerous|handful)")
THING = r"(?:labs?|builds?|projects?|repos?|repositories|entries|runbooks?)"

PATTERNS = [
    # "thirteen labs", "13 entries", and "Thirteen documented IT and security
    # labs" — the meta description, which is why the gap allows four words and
    # not two. That description is the version a recruiter sees in a search
    # result, so it is the LAST place a stale number should survive.
    (re.compile(rf"\b{NUM}\s+(?:\w+\s+){{0,4}}{THING}\b", re.I), "counts the work"),
    # "labs: thirteen" and "over ten builds"
    (re.compile(rf"\b(?:over|more than|upwards of|at least)\s+{NUM}\b", re.I), "counts the work"),
    (re.compile(r"\b(?:by hand|from scratch|hand-(?:built|written|made|coded))\b", re.I),
     "claims it was built by hand"),
]

# Strip <script>, <style> and HTML comments: the sprite, the JSON-LD and the
# authoring notes are not copy anyone reads.
STRIP = re.compile(r"<!--.*?-->|<script\b.*?</script>|<style\b.*?</style>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")

bad = []
for f in ("index.html", "resume.html", "404.html"):
    p = pathlib.Path(f)
    if not p.exists():
        continue
    raw = p.read_text()
    # meta description/og:description are copy even though they live in a tag
    metas = re.findall(r'<meta[^>]+content="([^"]*)"', raw, re.I)
    body = TAG.sub(" ", STRIP.sub(" ", raw))
    for text in [body, *metas]:
        for pat, why in PATTERNS:
            for m in pat.finditer(html.unescape(text)):
                bad.append(f"{f}: {why} — \"{m.group(0).strip()}\"")

for f in sorted(pathlib.Path("assets/js").glob("*.js")):
    src = f.read_text()
    # blank comments rather than deleting, so a stray match still reports sanely
    src = re.sub(r"/\*.*?\*/", lambda c: re.sub(r"[^\n]", " ", c.group(0)), src, flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    for m in re.finditer(r"'([^'\\\n]{12,})'|\"([^\"\\\n]{12,})\"|`([^`\\]{12,})`", src):
        text = next(g for g in m.groups() if g is not None)
        for pat, why in PATTERNS:
            hit = pat.search(text)
            if hit:
                bad.append(f"{f}: {why} — \"{hit.group(0).strip()}\"")

print("\n".join(dict.fromkeys(bad)))
PY
)
if [ -n "$countable" ]; then
  n=$(echo "$countable" | wc -l | tr -d ' ')
  bad "copy that needs hand-maintaining ($n): $(echo "$countable" | head -1)"
  echo "$countable" | sed 's/^/           /'
else
  ok "no copy counts the work or claims it was hand-built"
fi

# 15 — the canonical host, in one place and one place only.
#
#      Absolute URLs are unavoidable in og: and canonical tags — scrapers do not
#      resolve relative ones. That means the live hostname is typed into seven
#      places across two files, and a stale one is invisible: the page renders
#      perfectly while telling Google, LinkedIn and every job application that
#      the real site is somewhere else.
#
#      The site moved from a GitHub Pages subpath to a domain root. Both of
#      those failure modes matter, so this checks the host AND that nothing
#      still hardcodes the old /portfolio/ prefix.
SITE_URL="https://penna.lol"
stray=$(grep -rn "wardoep\.github\.io" index.html resume.html 404.html assets/ data/ 2>/dev/null || true)
if [ -n "$stray" ]; then
  bad "an absolute URL still points at the old Pages host: $(echo "$stray" | head -1)"
else
  ok "no shipped file references the old host"
fi

prefix=$(grep -rnE '(href|src|content)="/portfolio/' index.html resume.html 404.html 2>/dev/null || true)
if [ -n "$prefix" ]; then
  bad "a /portfolio/ subpath survived the move: $(echo "$prefix" | head -1)"
else
  ok "no /portfolio/ subpath left in shipped markup"
fi

# Every absolute URL that IS present must agree with SITE_URL. A canonical
# pointing one place and og:url another is worse than either alone.
wrong=$(grep -rhoE 'https://[a-z0-9.-]+' index.html resume.html 2>/dev/null \
        | grep -vE "^(${SITE_URL}|https://schema\.org|https://github\.com|https://www\.linkedin\.com)$" \
        | sort -u || true)
if [ -n "$wrong" ]; then
  bad "an unexpected absolute host in shipped markup: $(echo "$wrong" | head -1)"
else
  ok "every absolute URL agrees with $SITE_URL"
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
echo "(the local mount keeps a subpath on purpose — it is the stricter test)"
