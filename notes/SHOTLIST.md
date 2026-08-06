# Shot list

The gallery is built and dormant. It renders nothing until images exist, so
nothing looks broken while this sits unfinished — but until it is done, the site
*asserts* thirteen times and *shows* zero times, and for a support role one
screenshot of a working ticket queue outweighs three paragraphs claiming there
is one.

## How to add one

1. Capture at **1600×1000 or wider**, PNG.
2. Save to `assets/img/shots/<name>.png`.
3. Add it to the project in `scripts/seed-copy.py`:

```python
shots=[
    dict(src="helpdesk-queue.png",
         alt="The osTicket agent queue showing five open tickets across three departments",
         caption="Five worked tickets, each with the SLA target it was measured against."),
],
```

`alt` is what a screen reader hears — describe what is *in* the picture, never
"screenshot 1". `caption` is the line printed underneath; make it say why the
picture matters, not what it is.

4. `python3 scripts/seed-copy.py && ./publish.sh`

## Redact before saving — every time

The site publishes no personal detail today and the build gate enforces that for
text. **It cannot read your images.** Check every capture for:

- real names of people, and any real user account that is not `testuser`-style
- your phone number, home town, or `@yahoo` address
- employer names on anything that isn't already public (Stony Brook, Broadridge)
- public IP addresses, real hostnames, MAC addresses, serial numbers
- licence keys, API tokens, session cookies, password fields mid-type
- browser tabs, bookmarks bar, desktop wallpaper, notification popups

Crop to the application window. Nothing above it, nothing behind it.

---

## The six that matter, in priority order

### 1. `helpdesk-queue.png` — **the single most valuable image on this list**
`helpdesk-ticketing-lab`

The osTicket agent view, queue open, showing your five worked tickets with
department, priority and SLA columns visible. This is the artefact a desk
manager actually wants and no other repo can substitute for it.

### 2. `helpdesk-kb.png`
`helpdesk-ticketing-lab`

One KB article you wrote, in full. It proves the second half of the job — that
you write the fix down in a form the next person can use.

### 3. `ad-users.png`
`ad-network-lab`

Active Directory Users and Computers, `corp.lab` expanded, your OU structure
visible in the tree, and the delegated helpdesk group selected. Use lab account
names only.

### 4. `ad-delegation.png`
`ad-network-lab`

The Delegation of Control result — the helpdesk group with reset-password rights
and nothing else. This is the image that shows you understand the permission
boundary you would be working inside on day one, and almost nobody applying for
these roles has it.

### 5. `grafana-dashboard.png`
`monitoring-observability-lab`

Your Grafana dashboard with real data on it — CPU, disk, service up/down, over a
window long enough to look lived-in rather than just started. Hostnames renamed
if they leak anything.

### 6. `powershell-onboard.png`
`powershell-admin-toolkit`

A terminal running the onboarding script end to end, with the created user
visible in the output. Windows Terminal, dark, no other tabs.

---

## Numbers to fill in at the same time

`metric` renders a badge at the top of a project panel. It is empty everywhere
right now, and several labs **promise a number in their own copy and then don't
show it** — the hardening lab literally says *"so the improvement is a number
and not a claim."*

Only you have these. Do not let me guess them.

| project | `metric` | where to find it |
|---|---|---|
| `linux-hardening-lab` | `value="64 → 87"`, `label="Lynis hardening index, before and after"` | the two Lynis reports |
| `helpdesk-ticketing-lab` | `value="5"`, `label="tickets worked end to end, each with its KB article"` | the lab itself |
| `vuln-management-lab` | `value="N → 0"`, `label="criticals open after remediation and rescan"` | the Nessus before/after |
| `backup-dr-lab` | `value="3"`, `label="restore drills logged — the first one failed"` | the drill log |
| `honeypot-lab` | `value="N"`, `label="credential attempts captured in the first week"` | the analyzer output |
| `monitoring-observability-lab` | `value="N days"`, `label="continuous uptime under alerting"` | Uptime Kuma |

Format: a short value and a label that says what it measures. The badge is
deliberately small — it is a fact, not a headline.
