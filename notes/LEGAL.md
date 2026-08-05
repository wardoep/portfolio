# Naming and IP rules

Not legal advice — operating rules, so a future edit doesn't quietly undo them.

## The distinction that matters

Shipping *their assets* is the risk. An original implementation of a tile-grid
UI idiom is not: layout ideas and general look-and-feel are weakly protected.

So the line is drawn at assets and marks, not at inspiration.

## Rules

1. **The strings "Nintendo", "Wii", "Wii U", "Mii" and "Miiverse" never appear**
   in shipped copy, `<title>`, meta tags, the OG image, the repo name or the
   repo description. Call it a *console home menu* or a *channel menu*; the
   face in the corner is an **avatar**, never a Mii. Internal class names may
   say whatever helps — `publish.sh` only greps shipped content.
2. **Every icon is drawn from scratch.** No traced, extracted or downloaded
   console artwork. The sprite in `index.html` is all original.
3. **No console audio, ever.** Not the boot chime, not menu sounds. Beyond the
   IP question, sound on a job-facing site is a liability.
4. **Do not combine an exact colour lift with a wordmark.** The *combination* is
   what supports a trade-dress argument, not either half alone.
5. **One disclaimer line lives in the Colophon channel** and stays there.

## Enforcement

`publish.sh` check 5 greps shipped files for the trademark list and fails the
build. It has already caught one violation — a stray reference in a CSS comment.

## The bigger risk is career, not legal

Realistic legal exposure is a takedown request, not litigation. The likelier
cost is a hiring manager reading "hobbyist" before "hire". Mitigations, all of
which are already built:

- Panels are plain, high-contrast and scannable — the fun is in the frame, not
  in the content a recruiter has to read.
- Résumé and contact are one click from the start screen, and in the dock.
- `resume.html` is a boring, printable, ATS-safe page with no JavaScript.
  **That is the URL to put on applications**; the menu is the "personal site"
  field.
