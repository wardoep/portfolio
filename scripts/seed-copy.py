#!/usr/bin/env python3
"""One-time seed of the hand-written layer of data/projects.json.

Run once. After this, sync-projects.sh preserves everything written here —
it only ever replaces the `gh` block. Re-running is safe and idempotent: it
overwrites the same hand-written fields with the same values.

Every blurb is <= 90 characters so it fits the hover bubble without wrapping.
Copy is first-person, concrete, and written for someone skimming for 20 seconds.
"""
import json
import sys

PATH = "data/projects.json"
BLURB_MAX = 90

# id -> hand-written fields. Order here is documentation, not layout.
COPY = {
    # ---------------- SECURITY ----------------
    "soc-siem-lab": dict(
        folder="security", icon="siem", order=10, featured=True,
        blurb="Ran attacks against my own VMs, then wrote the rules that caught them.",
        stack=["Wazuh", "Sysmon", "Windows Server", "Ubuntu", "Detection rules"],
        highlights=[
            "Sysmon-instrumented Windows and Linux agents reporting into one Wazuh manager",
            "Attack simulations I ran myself, then custom detection rules written to catch them",
            "Incident write-ups in a repeatable format, so the analysis is reviewable",
        ],
        linkLabel="Read the write-ups",
    ),
    "phishing-analysis-lab": dict(
        folder="security", icon="mail", order=20,
        blurb="Full email triage: headers, SPF/DKIM/DMARC, IOC extraction, written verdict.",
        stack=["Python", "SPF / DKIM / DMARC", "IOC analysis", "Email headers"],
        highlights=[
            "Header analysis that walks the full Received chain back to the true origin",
            "SPF, DKIM and DMARC evaluated together rather than one at a time",
            "Python IOC extractor with defanged output, so a report can't be clicked by mistake",
            "A repeatable verdict template — the tier-1 deliverable, not just the analysis",
        ],
        linkLabel="See the triage template",
    ),
    "vuln-management-lab": dict(
        folder="security", icon="scan", order=30,
        blurb="The whole lifecycle: scan, triage by risk, remediate, rescan, report up.",
        stack=["Nessus Essentials", "Ubuntu", "Windows", "Risk triage"],
        highlights=[
            "Baseline scan, then triage by real risk rather than raw CVSS score",
            "Remediation followed by a verification rescan that proves the finding is closed",
            "A management-facing report — the step most labs skip",
        ],
        linkLabel="Read the report",
    ),
    "linux-hardening-lab": dict(
        folder="security", icon="lock", order=40,
        blurb="CIS-inspired Ubuntu hardening, scored by Lynis before and after.",
        stack=["Ubuntu", "Lynis", "auditd", "ufw", "sysctl"],
        highlights=[
            "Measured baseline score before touching anything",
            "An idempotent harden.sh covering SSH, firewall, auditd and sysctl",
            "Before/after Lynis delta, so the improvement is a number and not a claim",
        ],
    ),
    "honeypot-lab": dict(
        folder="security", icon="honeypot", order=50,
        blurb="A Cowrie SSH honeypot on an isolated VPS, and analysis of what it caught.",
        stack=["Cowrie", "Python", "VPS isolation", "Log analysis"],
        highlights=[
            "Deliberately isolated so a compromise stays contained",
            "Python analyzer surfacing top credentials tried and source IPs",
            "Attacker session replays turned into an attack-data report",
        ],
    ),

    # ---------------- IT / INFRASTRUCTURE ----------------
    "helpdesk-ticketing-lab": dict(
        folder="infra", icon="ticket", order=10, featured=True,
        blurb="A real helpdesk on osTicket: departments, SLAs, email piping, worked tickets.",
        stack=["osTicket", "Docker", "MySQL", "SLAs"],
        highlights=[
            "Departments, help topics and SLA targets configured the way a real desk runs",
            "Email piping so a message becomes a ticket without anyone retyping it",
            "Five worked tickets, each with the KB article it produced",
        ],
        linkLabel="See the worked tickets",
    ),
    "ad-network-lab": dict(
        folder="infra", icon="directory", order=20, featured=True,
        blurb="Active Directory and pfSense, written up as runbooks I can rebuild from.",
        stack=["Active Directory", "Group Policy", "pfSense", "PowerShell"],
        highlights=[
            "Group Policy and AGDLP permission nesting done properly, not ad hoc",
            "Helpdesk delegation, so a tier-1 tech can reset a password and nothing more",
            "PowerShell user provisioning, plus break/fix drills against my own lab",
        ],
        linkLabel="Read the runbooks",
    ),
    "powershell-admin-toolkit": dict(
        folder="infra", icon="terminal", order=30, featured=True,
        blurb="PowerShell for the daily Windows and AD jobs, run against my own domain.",
        stack=["PowerShell", "Active Directory", "Windows Server"],
        highlights=[
            "System inventory and health reports",
            "Event-log triage that surfaces the entries worth reading",
            "Onboarding and offboarding, the two tasks a helpdesk repeats most",
        ],
    ),
    "it-support-scripts": dict(
        folder="infra", icon="toolbox", order=40, featured=True,
        blurb="Linux troubleshooting toolkit: layered network and DNS diagnosis.",
        stack=["Bash", "journalctl", "systemd", "DNS"],
        highlights=[
            "Network and DNS diagnosis in layers, so you find the break instead of guessing",
            "Service health checks driven by journalctl",
            "Disk and system audits for the questions asked on every ticket",
        ],
    ),
    "monitoring-observability-lab": dict(
        folder="infra", icon="chart", order=50,
        blurb="Prometheus and Grafana watching the homelab, dashboards kept as code.",
        stack=["Prometheus", "Grafana", "node_exporter", "Alertmanager"],
        highlights=[
            "node_exporter metrics into Prometheus, visualised in Grafana",
            "Dashboards as code, so they survive a rebuild",
            "Disk, CPU and service alerts routed to Discord — alerts I actually receive",
        ],
    ),
    "backup-dr-lab": dict(
        folder="infra", icon="archive", order=60,
        blurb="3-2-1 backups with restic, encrypted on and off site. I test the restores.",
        stack=["restic", "systemd timers", "Ubuntu"],
        highlights=[
            "Encrypted local and offsite repositories, following 3-2-1 properly",
            "systemd timers and a retention policy rather than a cron job and hope",
            "Logged restore drills — an untested backup is not a backup",
        ],
    ),
    "docker-selfhosted-lab": dict(
        folder="infra", icon="container", order=70,
        blurb="A Docker Compose homelab behind a reverse proxy, with volume backups.",
        stack=["Docker", "Compose", "Nginx Proxy Manager", "Portainer", "Uptime Kuma"],
        highlights=[
            "Services behind a single reverse proxy instead of a sprawl of open ports",
            "Portainer and Uptime Kuma for management and availability",
            "Volume backups, because container data is the part people forget",
        ],
    ),
    "homelab-vps-setup": dict(
        folder="infra", icon="server", order=80,
        blurb="Runbooks for my Ubuntu server: SSH workflows, Tailscale mesh, rebuildable.",
        stack=["Ubuntu Server", "SSH", "Tailscale"],
        highlights=[
            "SSH administration workflows written down rather than remembered",
            "Tailscale mesh networking for access without exposing ports",
            "Setup documented so the box can be rebuilt from zero",
        ],
        note="Documentation, not code — written so the machine is reproducible.",
    ),

    # ---------------- BUILDS ----------------
    "jobbot": dict(
        folder="builds", icon="briefcase", order=10,
        blurb="Self-hosted job platform: multi-source ingestion, fit scoring, six alert channels.",
        stack=["Python", "IMAP", "SQLite", "REST APIs", "OAuth2"],
        highlights=[
            "Ingests postings from multiple sources into one searchable store",
            "AI resume-fit scoring to rank what is actually worth applying to",
            "Six alert channels and an IMAP inbox watcher, with credentials encrypted at rest",
        ],
        note="GitHub reports this as HTML; the working parts are Python.",
    ),
    "hermes-personal-assistant": dict(
        folder="builds", icon="brain", order=20,
        blurb="Architecture for the self-hosted assistant stack that runs on my server.",
        stack=["Architecture", "Self-hosted", "Automation"],
        highlights=[
            "Skills system, memory model and automation design",
            "Written before building, so the structure is deliberate",
        ],
        note="Design documentation, not code.",
    ),
    "twitch-clips-bot": dict(
        folder="builds", icon="clip", order=30,
        blurb="Discord bot delivering daily top clips. OAuth2, yt-dlp, 24/7 on systemd.",
        stack=["Python", "Discord API", "OAuth2", "yt-dlp", "systemd"],
        highlights=[
            "OAuth2 against the Twitch and Kick APIs with rate-limit handling",
            "Downloads quality-stepped to fit Discord's upload cap",
            "Runs continuously under systemd — uptime is the actual hard part",
        ],
    ),
    "ai-shorts-pipeline": dict(
        folder="builds", icon="film", order=40,
        blurb="Script to rendered short: TTS, captions, b-roll, ffmpeg, with cost guards.",
        stack=["Python", "ffmpeg", "TTS"],
        highlights=[
            "End-to-end assembly with a human review step before anything renders",
            "Quota pre-flight checks and budget tracking, so a bug can't run up a bill",
        ],
    ),
    "btc-backtest-lab": dict(
        folder="builds", icon="chart-line", order=50,
        blurb="Event-driven backtester with out-of-sample validation and a live paper test.",
        stack=["Python", "pandas", "systemd"],
        highlights=[
            "Event-driven engine with a strategy leaderboard",
            "Out-of-sample validation, because in-sample results prove nothing",
            "Hourly forward paper test run by a systemd timer",
        ],
    ),
    "wardoep": dict(
        folder="builds", icon="profile", order=90,
        blurb="My GitHub profile README — the index to everything here.",
        stack=["Markdown"],
        highlights=["Each repo carries a 'What I learned' section"],
        linkLabel="Open the profile",
    ),
    # Hidden on purpose. The site talking about how the site was made reads as
    # trying too hard on a page whose job is to talk about the person.
    "portfolio": dict(
        folder="builds", icon="code", order=60, hidden=True,
        blurb="The source for this site.",
        stack=["HTML", "CSS", "JavaScript"],
        highlights=[],
        linkLabel="View the source",
    ),
}

# Display names. A repo slug makes a poor tile label — "soc siem" reads as
# nonsense at 12px. The slug still shows in the panel, so the link is obvious.
TITLES = {
    "soc-siem-lab":                 "SIEM & Detection",
    "phishing-analysis-lab":        "Phishing Triage",
    "vuln-management-lab":          "Vulnerability Mgmt",
    "linux-hardening-lab":          "Linux Hardening",
    "honeypot-lab":                 "SSH Honeypot",
    "helpdesk-ticketing-lab":       "Helpdesk",
    "ad-network-lab":               "Active Directory",
    "powershell-admin-toolkit":     "PowerShell Toolkit",
    "it-support-scripts":           "Support Scripts",
    "monitoring-observability-lab": "Monitoring",
    "backup-dr-lab":                "Backup & DR",
    "docker-selfhosted-lab":        "Docker Homelab",
    "homelab-vps-setup":            "Server Runbooks",
    "jobbot":                       "Jobbot",
    "hermes-personal-assistant":    "Hermes",
    "twitch-clips-bot":             "Clips Bot",
    "ai-shorts-pipeline":           "Shorts Pipeline",
    "btc-backtest-lab":             "Backtester",
    "wardoep":                      "Profile README",
    "portfolio":                    "This Site",
}

# Folder order INSIDE the PROJECTS overlay. This lives here, not in
# merge_projects.py, because that file uses setdefault() — it seeds folders into
# a fresh document and never touches an existing one, so an order change there
# is silently ignored on every real run.
#
# Infrastructure leads. The target role is desktop support, and opening the
# overlay to SIEM / Phishing / Vulnerability Mgmt argued for a job that is not
# being applied for. Helpdesk and Active Directory are the case; security is
# the supporting evidence.
FOLDER_ORDER = {"infra": 1, "security": 2, "builds": 3, "unsorted": 9}

# The filled channels, in slot order. The grid fills from the top-left, so this
# list IS the reading order — PROJECTS takes slot 1 because it is the reason a
# hiring manager is on the page. (It used to sit at index 1 to be the centre
# card of a carousel; that carousel is gone.)
# A channel can span several folders; the overlay renders one section per folder.
#
# `kind` is the line UNDER the name on the card \u2014 what the thing actually is, in
# five or six words. The wall used to say "13 projects", which tells a hiring
# manager the count and not the point. Deliberately not derived from the count:
# the claim about the work is the sentence, and the number is its smaller half.
CHANNELS = [
    {
        # A ticket, not a shield. The icon on the main content channel is the
        # first thing read, and a shield announced "security portfolio".
        "id": "projects", "label": "PROJECTS", "icon": "ticket",
        "folders": ["infra", "security"],
        "kind": "IT & security labs, each written up",
        "blurb": "Hands-on IT and security labs, each documented as a rebuildable runbook.",
    },
    {
        "id": "builds", "label": "BUILDS", "icon": "wrench",
        "folders": ["builds"],
        "kind": "Things I wanted to exist, so I built them",
        "blurb": "Things I built because I wanted them to exist.",
    },
    {
        # Opens the panel, NOT a navigation away. The panel links on to
        # resume.html, which is the URL that goes on an application.
        "id": "resume", "label": "R\u00c9SUM\u00c9", "icon": "doc",
        "kind": "One page, printable, ATS-safe",
        "blurb": "Printable and ATS-safe.",
    },
]


def main():
    doc = json.load(open(PATH))
    by_id = {p["id"]: p for p in doc["projects"]}

    missing = [k for k in COPY if k not in by_id]
    if missing:
        print(f"copy written for repos that don't exist: {missing}", file=sys.stderr)
        return 1

    too_long = [(k, len(v["blurb"])) for k, v in COPY.items() if len(v["blurb"]) > BLURB_MAX]
    if too_long:
        for k, n in too_long:
            print(f"{k}: blurb is {n} chars (max {BLURB_MAX})", file=sys.stderr)
        return 2

    for pid, fields in COPY.items():
        p = by_id[pid]
        p.update(fields)
        p["title"] = TITLES.get(pid, pid)
        p["hidden"] = bool(fields.get("hidden", False))
        # Explicit, not update()-implied: dropping `featured=True` from the dict
        # above must actually clear it, and update() silently would not.
        p["featured"] = bool(fields.get("featured", False))
        p["status"] = "live"

    for f in doc.get("folders", []):
        if f["id"] in FOLDER_ORDER:
            f["order"] = FOLDER_ORDER[f["id"]]

    doc["channels"] = CHANNELS
    # both are dead keys from earlier home screens; leaving either behind
    # means a stale shape survives in the committed JSON
    doc.pop("carousel", None)
    doc.pop("layout", None)

    # Every visible project must be inside a folder a card can reach.
    reachable = {f for c in CHANNELS for f in c.get("folders", [])}
    stranded = sorted(pid for pid, p in by_id.items()
                      if not p.get("hidden") and p.get("folder") not in reachable)
    if stranded:
        print(f"UNREACHABLE — in no channel's folders: {stranded}")
        return 3

    json.dump(doc, open(PATH, "w"), indent=2, ensure_ascii=False)
    open(PATH, "a").write("\n")

    longest = max(COPY.items(), key=lambda kv: len(kv[1]["blurb"]))
    print(f"seeded {len(COPY)} projects, {len(CHANNELS)} channels")
    print(f"longest blurb: {len(longest[1]['blurb'])} chars ({longest[0]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
