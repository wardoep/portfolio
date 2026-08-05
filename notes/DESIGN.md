# Design notes

## The brief

A console home menu — start screen you click into, a tile grid, an avatar in the
corner — with the green of a handheld dot-matrix screen laid over it. For an
audience of IT and cybersecurity hiring managers.

The tension is obvious: the frame is playful, the reader is not. Everything
below is a decision about where that line sits.

## Where the green goes

Over the interface, not into it. The base palette stays a light console menu —
white tiles, soft shadows, real icon colour — and the green is four blend layers
on top. Making the greens the *base* palette would have meant every icon becomes
a four-tone sprite, and the whole thing reads as a toy.

Five layers, two containers:

```
#crt-under  wash (multiply) · lift (screen) · bloom · vignette
   panels render here, at z-index 1000
#crt-over   scanlines
```

**Panels sit between them.** The prose a recruiter actually reads keeps 100% of
its contrast while scanlines still ride over the top. Slightly less faithful;
the difference between a readable résumé and a green one.

## What measurement changed

The tint costs about **19% of contrast ratio, not 50%** — multiply-then-screen
is a fairly linear remap. `#161a16` on white still measures 15.22 tinted.

So the tint was never the readability villain. Two real problems surfaced
instead, both found by running the numbers rather than trusting the eye:

- **White on the selection cyan measures 1.63 under the tint** — and fails at
  2.12 even with the tint off. That is the classic console "Start" strip, and it
  has always been an accessibility failure. Fixed with dark ink on cyan (8.13).
- **The link colour failed by 0.07.** `#0a7f96` measured 4.43 against white once
  the wash applied — invisible by eye, a fail on paper. Now `#097082`.

`scripts/check-contrast.mjs` reimplements the blend and fails the build, because
two representations of one rule always drift.

The first render also proved the bloom misbehaves at scale: at `.35` it read as
a yellow blob across the middle of the grid. It is `.13` now. The wash alone
carries the phosphor.

## Rejected

| Idea | Why not |
|---|---|
| Game Boy four-green as the base palette | Every icon becomes a 4-tone sprite; reads as a toy to the actual audience |
| `filter: blur()` for the tube bloom | Promotes the document to one composited layer, kills subpixel text, tanks scroll on a phone |
| Barrel distortion | Needs `feDisplacementMap` or WebGL; a border-radius and an inset shadow read as a tube for free |
| Menu music | Autoplay is blocked, the audio would be infringing, and sound on a job site is a liability |
| Tint on by default on phones | Phones get used at low brightness outdoors, and Night Shift warms the display and flattens the green further. On above 900px, off below. |
| Scanlines on mobile | A 1px/3px pattern moirés on OLED and shimmers while scrolling |
| Folders holding only non-featured repos | Would leave two folders nearly empty. Featured repos appear in both places, with a pin badge to show it. |

## The grid

Row 1 is the only row a 20-second skim reliably sees, so it carries **proof, not
navigation** — and the five tiles cover all four target role families rather than
ranking the best work:

1. SIEM & Detection, 2. Phishing Triage, 3. Vulnerability Mgmt — the SOC case,
   in the order a SOC job description reads.
4. Helpdesk — the most likely first job, and the closest thing to a job simulation.
5. Active Directory — **the highest-value keyword in the whole portfolio.**

Row 2 is navigation and identity. Row 3 is the four things a recruiter actually
does: read the résumé, check you're still learning, make contact, verify you.

The three off-message repos — a crypto backtester, an AI video pipeline, a
Twitch bot — sit in the bottom-right of page 2, the least-looked-at position on
the site. Good engineering, wrong signal for a SOC role, and Broadridge is
fintech. Deliberate, not accidental.

## Accessibility

`role="grid"` is a promise: it tells a screen-reader user the layout has a
shape, and obliges arrow-key movement. A grid without it is worse than a list.

Roving tabindex makes the whole grid **one tab stop** — five stops to cross the
page instead of twenty-five. At a row edge, ← and → turn the page and land in
the mirrored column so the eye keeps its place.

**Focus restoration hangs off the router, not the click handler.** That is the
bug nearly everyone ships: the panel closes via the browser back button, no
click handler runs, and focus lands on `<body>`. Because the route is the only
thing that decides what is open, Escape, the scrim, the close button and the
back button all restore focus through one path.

The start screen is a real `<button>`, autofocused, shown once per *session*,
and **skipped entirely when the URL carries a route** — a shared deep link must
not hit a black gate.
