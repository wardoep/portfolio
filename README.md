# portfolio

Edward Penna — IT support and cybersecurity portfolio, built as a console-style
home menu. Hand-written HTML, CSS and ES modules. No framework, no bundler, no
build step.

**Live:** <https://wardoep.github.io/portfolio/>

---

## Run it

```bash
./serve.sh                 # http://localhost:8091/portfolio/
./serve.sh 8092            # another port
```

**The dev server mounts the site at `/portfolio/` on purpose.** GitHub Pages
serves a project site from a subpath, and serving from `/` in development hides
an entire class of bugs — absolute asset paths, pathname-based routing, a stray
leading slash in `url()` — until production, where the fix cycle is a push plus
a ten-minute CDN wait. `/` redirects to `/portfolio/` so you cannot test the
wrong thing by accident.

`file://` will not work: ES modules and `fetch()` both require a real origin.

## Deploy

```bash
./deploy.sh "commit message"
```

Pages serves the branch, so **pushing is the deploy**. `publish.sh` is not a
deploy step — it runs the pre-flight checks and builds `dist/portfolio/` so you
can inspect exactly what Pages will serve.

## Refresh the project data

```bash
./scripts/sync-projects.sh              # pull repos, merge, write
./scripts/sync-projects.sh --dry-run    # show what would change
./scripts/sync-projects.sh --check      # exit non-zero if stale or unfinished
```

### The one rule that keeps your writing safe

Every GitHub-derived field lives inside a single `gh` object. The sync script
**replaces `.gh` wholesale and touches nothing else.** Everything outside `gh` —
`title`, `blurb`, `folder`, `icon`, `order`, `featured`, `stack`, `highlights`,
`note` — is hand-written by definition and unreachable by the script.

Projects are joined on `ghId`, the GitHub node ID, **never on the repo name.** A
name-based join treats a rename as delete-then-create and silently destroys the
hand-written copy. Renames push the old slug onto `renamedFrom` so existing
links keep resolving.

Other deliberate behaviours:

| Situation | What happens |
|---|---|
| New repo appears | Added `hidden: true`, in `unsorted`, with an empty blurb. It cannot reach the site until you write a sentence about it. |
| Repo disappears | Marked `status: "missing"`, **never deleted.** A temporary visibility flip must not destroy your copy. |
| `gh` returns < 5 repos | Refuses to sync. An expired token would otherwise blank the whole site. |

`--visibility public` is **mandatory**, not tidiness: the `gh` token carries
`repo` scope, so an unfiltered listing includes private repositories and would
bake their names and descriptions into a publicly served JSON file.

## Checks

```bash
./publish.sh                      # all ten pre-flight checks
node scripts/check-contrast.mjs   # WCAG ratios computed through the tint blend
```

`publish.sh` fails on: absolute asset paths, a `<base>` tag, case-only filename
collisions, a missing `.nojekyll`, console trademarks in shipped content, leaked
personal details, stale or unfinished project data, contrast below threshold, an
icon that is not in the sprite, and an `.ico` svg missing its `viewBox`.

Every one of those corresponds to a bug that is invisible locally.

## Layout

```
index.html          the whole site — menu shell, hand-written panels, SVG sprite, avatar
resume.html         standalone printable résumé. No JS, no webfont. THIS is the URL for applications.
404.html            the only file that hardcodes /portfolio/ — see the comment inside
data/projects.json  19 repos: hand-written fields + a machine-owned `gh` block
assets/css/         tokens · menu · panels · crt
assets/js/          site · router · menu · grid-nav · panels · settings · util
scripts/            sync-projects · seed-copy · check-contrast
notes/              DESIGN.md · LEGAL.md
```

## Things that will bite you

- **Four places hardcode the URL:** `404.html`, and `canonical` / `og:url` /
  `og:image` in `index.html`. Adding a `CNAME` moves the site to a domain root
  and silently invalidates all four.
- **Never add a `<base>` tag.** It rebases `<use href="#icon">` to an absolute
  URL, which Chrome and Safari fail to resolve, blanking every icon with no
  console error.
- **The sprite is drawn in a 24-unit space.** A consuming `<svg class="ico">`
  without `viewBox="0 0 24 24"` clips small icons to their top-left corner
  rather than scaling them. This already happened once.
- **Pages caches for ~10 minutes** and the header cannot be changed.
  `publish.sh` stamps `?v=<sha>` onto CSS and JS.
- **Pages runs Linux.** A case-only filename difference works on macOS and 404s
  live.
- **Hash routing is required**, not stylistic. Pages has no rewrite rules, so a
  History API route would 404 on refresh and on every shared link.

## Credits

Type: **M PLUS Rounded 1c** (The M+ FONTS PROJECT) and **Departure Mono**
(Helena Zhang), both SIL Open Font License 1.1 — licences ship in
`assets/fonts/`. Self-hosted, so visiting the page makes no third-party request.

Icons and the avatar were drawn for this site. The interface is an original
implementation inspired by 2010s console home menus; it is not affiliated with,
endorsed by, or connected to any console manufacturer. See `notes/LEGAL.md`.
