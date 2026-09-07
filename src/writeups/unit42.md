# HTB Sherlock: Unit42 — Full Writeup

**Category:** DFIR / Endpoint Forensics | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Very Easy | **Artifact:** Sysmon | **Solved:** September 2026

---

## Synopsis

A phishing-driven malware infection reconstructed entirely from a single Sysmon EVTX — no memory image, no network capture, no Security log. A user on a workstation ran a disguised executable pulled from a Dropbox share link; the malware dropped a decoy PDF with a backdated creation timestamp, planted a batch script under a fake "Photo and Fax" install path, ran a connectivity check against a dummy domain, installed a trojanized remote-access tool, and then exited.

**Chain:** Dropbox-hosted dropper downloaded → executed → decoy PDF dropped with a timestomped creation date → batch script dropped under a disguised install path → connectivity check against a known-good dummy domain → backdoored UltraVNC installed → dropper process self-terminates

Every question in this room maps to a specific Sysmon Event ID — it's the intended first stop for building that vocabulary before tackling anything heavier.

---

## Tooling

The entire investigation ran against a single Sysmon EVTX (`Microsoft-Windows-Sysmon-Operational.evtx`) with [Chainsaw](https://github.com/WithSecureLabs/chainsaw) — no live host, no GUI required. Two patterns did all the work:

```bash
# Full-text search across every field
chainsaw search "Preventivo24.02.14.exe.exe" -i Microsoft-Windows-Sysmon-Operational.evtx

# Tau-expression filter on a specific field (here, Event ID)
chainsaw search -t 'Event.System.EventID: =22' Microsoft-Windows-Sysmon-Operational.evtx
```

`--json` piped through `jq` turns either into a sortable timeline — the pattern reused for every correlation step below:

```bash
chainsaw search -t 'Event.System.EventID: =22' Microsoft-Windows-Sysmon-Operational.evtx --json \
  | jq -r '.[] | "\(.timestamp) \(.Event.EventData.QueryName)"' | sort
```

---

## Investigation

### Establishing scope

```bash
chainsaw search -t 'Event.System.EventID: =11' Microsoft-Windows-Sysmon-Operational.evtx
```

56 FileCreate events — confirmed there was real file-write activity worth walking through before diving into any single one.

### Identifying the malicious process

```bash
chainsaw search -t 'Event.System.EventID: =1' Microsoft-Windows-Sysmon-Operational.evtx
```

Filtering Event ID 1 (ProcessCreate) surfaced the dropper:

```
C:\Users\CyberJunkie\Downloads\Preventivo24.02.14.exe.exe
```

Two disguises stacked in one filename: a **double extension** (with Explorer's "hide known file extensions" default, this displays as just `Preventivo24.02.14.exe`, masking the real one), and an **Italian-language lure** ("Preventivo" = "quote/estimate" — standard invoice-phishing bait).

### Tracing the delivery source

No Sysmon field directly links a downloaded file to the DNS query that resolved its host — this required correlating two event types **by timestamp**:

1. Pull the exact FileCreate time for the dropper.
2. Pull every DnsEvent (Event ID 22), sorted chronologically:

```bash
chainsaw search -t 'Event.System.EventID: =22' Microsoft-Windows-Sysmon-Operational.evtx --json \
  | jq -r '.[] | "\(.timestamp) \(.Event.EventData.QueryName)"' | sort
```

3. Find the query landing immediately before the file-create time:

```
d.dropbox.com
uc2f030016253ec53f4953980a4e.dl.dropboxusercontent.com
www.example.com
```

The first two are Dropbox's redirect/download-CDN domains — confirms the dropper was pulled from a Dropbox share link, not a purpose-built C2 domain. Using a legitimate, trusted cloud-storage provider for delivery is a deliberate choice: it blends into normal traffic and is far less likely to be blocked by content filtering than a domain registered for the campaign. (`www.example.com`, the third hit in the same query window, turned out to answer a different question — see below.)

### Catching the timestomp

One dropped file (a decoy PDF) carried a populated `RuleName` field on its FileCreate event:

```
RuleName: technique_id=T1070.006,technique_name=Timestomp
```

Sysmon's own rule configuration tagged the event with its MITRE ATT&CK technique ID directly — no separate lookup required. The event itself carried both the fabricated and the real timestamp:

```
CreationUtcTime:         2024-01-14 08:10:06
PreviousCreationUtcTime: 2024-02-14 03:41:58
```

`PreviousCreationUtcTime` is what the timestamp actually was; `CreationUtcTime` is the value the malware overwrote it with — backdated roughly a month, enough to blend with plausibly old files on disk without looking absurd.

### Tracing the rest of the drop

Continuing through FileCreate events tied to the same process surfaced a batch script planted under a folder structure mimicking a legitimate installed application (`Photo and Fax Vn\...`) — the same "make it look ordinary" logic as the timestomp, applied to a file path instead of a timestamp.

### The dummy connectivity check

A second DNS query from the same result set resolved `www.example.com` to `93.184.216.34`. `example.com` is an IANA-reserved domain guaranteed to resolve from almost anywhere — malware commonly queries it first as a cheap "do I have working internet/DNS" check, since it's far less likely to be blocked than the real second-stage or C2 infrastructure that follows.

### Final payload and exit

The dropper's last act was installing a **backdoored variant of UltraVNC** — a legitimate, widely used remote-desktop tool, trojanized for persistent remote access.

```bash
chainsaw search -t 'Event.System.EventID: =5' Microsoft-Windows-Sysmon-Operational.evtx
```

Filtering Event ID 5 (ProcessTerminate) on the dropper's PID showed it exiting immediately afterward: task complete, no reason to keep running.

---

## Key Takeaways

- **DNS and file-write events rarely share a linking field** — correlate by nearest-preceding timestamp when there's no direct join. This is the most reusable technique in the room: it generalizes to almost any "what delivered this file" question in later, harder cases.
- **A Sysmon rule's `RuleName` can hand you the MITRE technique ID for free** when the config maps rules to ATT&CK — worth checking on every event during triage, not just the ones expected to carry it.
- **Timestomp detection is a two-field comparison**, not a single suspicious value: the *fabricated* timestamp alone tells you nothing was wrong; it's the mismatch against the field recording what it actually was that proves tampering.
- **The disguise operates at every layer of the chain, not just the binary** — a double file extension, a fake-branded install path, a trusted cloud-storage provider for delivery, and a trojanized-but-legitimate remote-access tool are four separate instances of the same underlying idea: make something malicious look like something ordinary.

---

## Detection Opportunities

- Alert when a file's `CreationUtcTime` is materially earlier than its `PreviousCreationUtcTime` on a file written by a process that itself just launched — a live timestomp, not a false positive from normal file operations.
- Automatically correlate newly downloaded executables (FileCreate) against the nearest-preceding DNS query — flag when the resolved domain belongs to a consumer file-sharing service rather than expected software-distribution infrastructure.
- Baseline queries to `example.com` and similar IANA test domains from non-browser processes — rare in ordinary traffic, common as a malware connectivity check.
- Flag double file extensions in Downloads (`*.exe.exe`, `*.pdf.exe`) — a simple, still-effective filename check.
- Flag remote-access tool installation (UltraVNC, AnyDesk, etc.) where the parent process is a freshly downloaded, unsigned executable rather than an IT-deployed installer.
