#!/usr/bin/env python3
"""Merge a `gh repo list` snapshot into data/projects.json.

Called by sync-projects.sh; not meant to be run directly.

The join key is the GraphQL node id (`ghId`), never the repo name. A name-only
join sees a rename as delete-then-create and silently destroys the hand-written
blurb, folder, icon and order — the exact work this file exists to protect.

Exit codes:  0 ok   1 stale (--check)   2 unfinished copy (--check)
"""
import json
import sys
from datetime import date

MACHINE_KEY = "gh"          # the only key this script is allowed to overwrite
BLURB_MAX = 90

HAND_WRITTEN_DEFAULTS = {
    "blurb": "",
    "folder": "unsorted",
    "icon": "default",
    "featured": False,
    "hidden": True,          # never surface a repo before a human describes it
    "stack": [],
    "highlights": [],
    "linkLabel": "View on GitHub",
    "note": "",
}


def remote_gh(r):
    """Normalise one gh record into the machine-owned block."""
    lang = (r.get("primaryLanguage") or {}).get("name")
    branch = (r.get("defaultBranchRef") or {}).get("name") or "main"
    topics = r.get("repositoryTopics") or []
    if topics and isinstance(topics[0], dict):
        topics = [t.get("name") for t in topics if t.get("name")]
    return {
        "name": r["name"],
        "description": r.get("description") or "",
        "language": lang,                      # may be null — render "—", never "null"
        "stars": r.get("stargazerCount", 0),
        "pushedAt": r.get("pushedAt") or "",
        "createdAt": r.get("createdAt") or "",
        "url": r.get("url") or "",
        "homepageUrl": r.get("homepageUrl") or "",
        "defaultBranch": branch,               # 5 repos are `master`; deep links need this
        "isArchived": bool(r.get("isArchived")),
        "topics": topics,
    }


def load(path, fallback):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def main():
    cache_path, out_path, mode = sys.argv[1], sys.argv[2], sys.argv[3]
    today = date.today().isoformat()

    remote = load(cache_path, [])
    doc = load(out_path, {})
    if not isinstance(doc, dict):
        doc = {}

    doc.setdefault("syncVersion", 1)
    doc.setdefault("source", "gh repo list --visibility public --source --limit 200")
    doc.setdefault("folders", [
        {"id": "security", "label": "SECURITY", "order": 1, "icon": "shield",
         "blurb": "Detection, triage and hardening — run against systems I broke on purpose."},
        {"id": "infra", "label": "IT / INFRASTRUCTURE", "order": 2, "icon": "rack",
         "blurb": "The plumbing: directory services, ticketing, monitoring, backups."},
        {"id": "builds", "label": "BUILDS", "order": 3, "icon": "wrench",
         "blurb": "Things I built because I wanted them to exist."},
        {"id": "unsorted", "label": "UNSORTED", "order": 9, "icon": "box",
         "blurb": "New repos land here, hidden, until a blurb is written."},
    ])
    projects = doc.get("projects", [])

    by_ghid = {p["ghId"]: p for p in projects if p.get("ghId")}
    by_id = {p["id"]: p for p in projects if p.get("id")}

    changed = False
    seen = set()
    notes = []

    for r in remote:
        ghid = r["id"]
        name = r["name"]
        seen.add(ghid)
        entry = by_ghid.get(ghid) or by_id.get(name)

        if entry is None:                                   # brand new repo
            entry = {"ghId": ghid, "id": name, "renamedFrom": [],
                     **HAND_WRITTEN_DEFAULTS,
                     "order": (max((p.get("order", 0) for p in projects), default=0) + 10),
                     "status": "new", "firstSeen": today}
            projects.append(entry)
            changed = True
            notes.append(f"NEW:     {name} — hidden until you write a blurb")
        elif entry.get("id") != name:                       # renamed upstream
            old = entry["id"]
            entry.setdefault("renamedFrom", [])
            if old not in entry["renamedFrom"]:
                entry["renamedFrom"].append(old)
            entry["id"] = name
            changed = True
            notes.append(f"RENAMED: {old} -> {name} (old links still resolve)")

        entry["ghId"] = ghid
        for k, v in HAND_WRITTEN_DEFAULTS.items():
            entry.setdefault(k, v)
        entry.setdefault("renamedFrom", [])
        entry.setdefault("firstSeen", today)

        new_gh = remote_gh(r)
        if entry.get(MACHINE_KEY) != new_gh:
            entry[MACHINE_KEY] = new_gh                     # replace wholesale
            changed = True
        if entry.get("status") != "live" and entry.get("status") != "new":
            changed = True
        entry["status"] = "new" if entry.get("blurb", "") == "" else "live"
        entry["lastSeen"] = today

    for p in projects:                                      # gone upstream
        if p.get("ghId") and p["ghId"] not in seen and p.get("status") != "missing":
            p["status"] = "missing"                         # never delete
            changed = True
            notes.append(f"MISSING: {p['id']} — kept, hidden from the grid")

    folder_order = {f["id"]: f.get("order", 99) for f in doc["folders"]}
    projects.sort(key=lambda p: (folder_order.get(p.get("folder"), 99),
                                 p.get("order", 0), p.get("id", "")))
    doc["projects"] = projects
    doc["generatedAt"] = today

    for n in notes:
        print(n)

    if mode == "check":
        problems = []
        for p in projects:
            if p.get("hidden") or p.get("status") == "missing":
                continue
            if not p.get("blurb"):
                problems.append(f"{p['id']}: visible with an empty blurb")
            elif len(p["blurb"]) > BLURB_MAX:
                problems.append(f"{p['id']}: blurb is {len(p['blurb'])} chars (max {BLURB_MAX})")
            if p.get("folder") == "unsorted":
                problems.append(f"{p['id']}: visible but still in `unsorted`")
        if problems:
            print("\n".join("  " + x for x in problems), file=sys.stderr)
            return 2
        if changed:
            print("data/projects.json is stale — run sync-projects.sh", file=sys.stderr)
            return 1
        print(f"projects.json current: {len(projects)} repos")
        return 0

    payload = json.dumps(doc, indent=2, ensure_ascii=False, sort_keys=False) + "\n"
    if mode == "dry":
        old = ""
        try:
            old = open(out_path).read()
        except FileNotFoundError:
            pass
        print(f"would {'change' if payload != old else 'leave unchanged'} {out_path} "
              f"({len(projects)} repos)")
        return 0

    with open(out_path + ".tmp", "w") as f:
        f.write(payload)
    print(f"wrote {len(projects)} repos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
