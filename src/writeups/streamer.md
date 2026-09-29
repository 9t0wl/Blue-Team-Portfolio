# HTB Sherlock: Streamer, Full Writeup

**Category:** DFIR / Malware Triage (Malvertising & Backdoor) | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Hard | **Solved:** 29 September 2026

---

## TL;DR

A developer searches for a streaming tool, clicks a Google-Ads-promoted typosquat result, and downloads what looks like a legitimate OBS Studio installer. It is legitimate, in the sense that it really does install real OBS Studio, which is exactly why nothing looks wrong to the victim. Underneath, it also drops a deliberately bloated ~1.1 GB backdoor with a randomized filename, persists via a scheduled task disguised as a familiar Windows process name, beacons to a DGA-generated domain, and exfiltrates to an S3 bucket. A security analyst later triages the box with KAPE, staged from a share on a separate analyst machine.

Fifteen tasks, almost the entire EZ Tools suite, and one artifact category (ShellBags) that the case never needed until the very last question, at which point it turned out to be the only thing that could answer it.

---

## Scenario

> Simon Stark is a dev at Forela who recently planned to stream some coding sessions with colleagues, on which he received appreciation from the CEO and other colleagues too. He unknowingly installed a well known streaming software which he found by Google search, and it was one of the top URLs being promoted by Google Ads. Unfortunately things took a wrong turn and a security incident took place. Analyze the triaged artifacts provided to find out what happened exactly.

---

## Methodology & Tooling

The evidence is a KAPE-style targeted triage collection, a full `C:\` artifact tree, not a disk image. That distinction matters immediately: arbitrary user documents (Downloads, most of Documents) were never collected, only designated forensic artifact types, so several tasks require recovering content that was never physically present in the evidence.

```powershell
LECmd.exe    -d "...\Recent" --csv <out>
JLECmd.exe   -d "...\Recent\AutomaticDestinations" --csv <out>
RBCmd.exe    -d "...\$Recycle.Bin\<SID>" --csv <out>
MFTECmd.exe  -f "...\$MFT" --csv <out>
MFTECmd.exe  -f "...\$Extend\$J" --csv <out>
AmcacheParser.exe -f "...\Amcache.hve" --csv <out>
PECmd.exe    -f "...\<name>.pf" --csv <out>
EvtxECmd.exe -f "...\<name>.evtx" --csv <out>
SBECmd.exe   -d "...\Users\<user>" --csv <out>
```

Browser history (DB Browser for SQLite against Edge's `History`) was the obvious first move and a dead end, it comes up second in the investigation below, but it's worth naming here since it shapes everything that follows: when the expected artifact is clean, the case doesn't stop, it pivots to whatever survives independently of it.

---

## Investigation, Every Task

### Task 1, Original Malicious Zip Filename

Edge's SQLite `History` (both a version-pinned Snapshot and the live profile) turned up nothing, one legitimate GitHub download and 15 rows of stale baseline browsing. The pivot to shell-level artifacts, `LECmd`/`JLECmd` against `Recent`, recovered it instead: a Recent-folder LNK pointing at `OBS-Studio-28.1.2-Full-Installer-x64.zip` in `Downloads`, Target Created `2023-05-05 10:19:46`, ~134 MB, consistent with a real installer.

**Answer:** OBS-Studio-28.1.2-Full-Installer-x64.zip

### Task 2 & 3, Renamed File and Rename Timestamp

The zip's LNK carried a cached **Target MFT Entry Number**. A file's MFT entry/sequence stays stable across a rename, only a delete plus slot-reuse changes it, so that same record, looked up directly in a full `$MFT` parse, showed the file's current name: `Documents\Streaming Software\Obs Streaming Software.zip`.

The rename timestamp took two attempts. The first submission used the `$FILE_NAME` (0x30) attribute's own timestamp and was rejected, a reminder that not every plausible-looking timestamp column is the one being asked for. The fix was the **USN Journal** (`$Extend\$J`, parsed with `MFTECmd`, which handles `$MFT`/`$Boot`/`$SDS`/`$J` but not raw `$LogFile`), which logs an explicit `RenameNewName` event for that exact record, `2023-05-05 10:22:23`, independently confirmed by the file's own `Last Record Change 0x10` timestamp.

**Answers:** C:\Users\Simon.stark\Documents\Streaming Software\Obs Streaming Software.zip, renamed 2023-05-05 10:22:23

### Task 4, Full Download URL

The renamed zip's own MFT record carried a `:Zone.Identifier` Alternate Data Stream, the Mark-of-the-Web tag Windows attaches to anything downloaded via a browser, decoded automatically by `MFTECmd` into a `Zone Id Contents` field. This is where the URL survived, since Edge's own history never had it:

```
[ZoneTransfer]
ZoneId=3
HostUrl=http://obsproicet.net/download/v28_23/OBS-Studio-28.1.2-Full-Installer-x64.zip
```

`obsproicet.net` is a typosquat of the real `obsproject.com`. ZoneId 3 (Internet zone) confirms this really did come through a browser, the SQLite history was simply cleared or never wrote it.

**Answer:** http://obsproicet.net/download/v28_23/OBS-Studio-28.1.2-Full-Installer-x64.zip

### Task 5 & 6, Hosting IP and Highest Source Port

`pfirewall.log` had ALLOW logging enabled, useful, except its timestamps are local system time while every EZ Tools output in this case defaults to UTC. Rather than guess the offset, two independently-known UTC events (the download at `10:19:46`, the install burst at `10:23:14`-`10:25:48`) were tested against a `local = UTC + 5h` hypothesis, both predictions landed almost exactly on real firewall activity bursts, confirming it.

Filtering every port-80 connection log-wide surfaced `13.232.96.186` clustered right at the predicted download moment, the only IP in that cluster that wasn't also recurring background CDN noise on unrelated days. Six connections to it gave the highest source port directly.

**Answers:** 13.232.96.186, port 50045

### Task 7, Setup File SHA-1

Amcache (`AmcacheParser` against `Amcache.hve`) stores a SHA-1 per executed binary, unlike Prefetch or Shimcache. Searching for the installer's own name found its execution record, timestamp matching the first Prefetch run exactly, confirming this was the actual copy that ran, not just a file sitting on disk.

**Answer:** 35e3582a9ed14f8a4bb81fd6aca3f0009c78a3a1

### Task 8, Backdoor Name and Filepath

The hardest identification in the case, three attempts before the real one.

Two candidates looked strong and both were wrong. A relocated copy of the installer under a folder named `StrLocalGate` (not a real vendor path) turned out to be the **persistence** artifact, not the backdoor. A file called `ghosts.exe` had a suspicious Recycle Bin trace and an equally suspicious name, but its Amcache first-seen timestamp was a full day before the actual download, it predates the incident and is most plausibly an unrelated dev project on the victim's own machine, not malware. Both looked right and neither was, timestamps against the actual infection window are what separated real evidence from coincidence.

The real backdoor was found by reading the raw Prefetch folder listing directly rather than searching by any known name: a gibberish, space-separated filename sitting in the exact right time cluster, alongside `SCHTASKS.EXE`, `CMD.EXE`, `PING.EXE`, `CHCP.COM`, a textbook post-install batch-script pattern. Its `$MFT` record confirmed a ~1.1 GB file size, deliberately bloated to sit above the size limits a lot of automated sandboxes and AV engines skip scanning past, created seconds before its own Prefetch execution.

**Answer:** C:\Users\Simon.stark\Miloyeki ker konoyogi\lat takewode libigax weloj jihi quimodo datex dob cijoyi mawiropo.exe

### Task 9, Backdoor Prefetch Hash

Prefetch filenames carry an 8 hex-character hash suffix, derived from the full path the executable ran from, in the `.pf` filename itself. No separate lookup needed once the backdoor's own Prefetch entry was found.

**Answer:** D8A6D943

### Task 10, Persistence Mechanism Name

`Windows\System32\Tasks\` top-level listing showed one clear standout among stock OS tasks and legitimate app tasks (Edge Update, OneDrive), a task named after the real, familiar Windows "COM Surrogate" process (`dllhost.exe`), with the space dropped, `LastWriteTime` landing exactly inside the infection window. Reusing a recognizable process name is a deliberate choice, most people skim right past it in a Task Scheduler list.

**Answer:** COMSurrogate

### Task 11, Bogus C2 Domain

The DNS Client Operational event log (`EvtxECmd`) holds every DNS query attempt, success or failure, but finding one anomalous domain in it meant filtering the right way. The volume-heavy Event IDs (request/completion/server-list) fired on every single query, over 12,000 in an 8-minute window, far too noisy to scan by eye. The fix was filtering to genuinely **rare** Event IDs instead, one with only a few hundred occurrences across the entire 47,000-record file, which surfaced the domain immediately, sitting amid legitimate CDN and developer traffic.

**Answer:** oaueeewy3pdy31g3kpqorpc4e.qopgwwytep

### Task 12, S3 Exfiltration URL

A plain-text search for the AWS domain suffix across the same DNS log found the exfil destination directly.

**Answer:** bbuseruploads.s3.amazonaws.com

### Task 13, Week 1 Stream Topic

A note file (`Week 1 plan.txt`) flagged early via a Jump List entry wasn't present in the evidence, KAPE's targeted collection doesn't grab arbitrary user documents, but at only ~54 bytes it was small enough that NTFS would have stored its content **resident**, inline inside the MFT record itself rather than out in separate disk clusters. The bulk CSV export's resident-data column came back blank for this row, but `MFTECmd`'s single-record dump mode printed the full attribute detail to console, resident `$DATA` included.

**Answer:** FileSystem Security

### Task 14, Security Analyst Name

Stood out immediately as a local account distinct from the victim and his colleague in the original evidence tree, confirmed by a Prefetch execution of KAPE's GUI launcher during the collection window.

**Answer:** CyberJunkie

### Task 15, Network Path of the Acquisition Tools

An extended dead-end chase before the real answer. The KAPE GUI's own Prefetch trace showed only local volume references. A second, command-line KAPE execution existed as `$MFT` metadata but its actual Prefetch content was never collected, most likely written mid-acquisition and missed by KAPE's own Prefetch-folder grab. Amcache had no record of it at all. A folder reference found via LNK analysis turned out to be empty. An SMB Client Connectivity log surfaced a server name but never a paired share.

The actual artifact needed was one never touched anywhere else in the case: **ShellBags**, the registry structures Windows quietly maintains recording every folder a user has ever browsed to in Explorer, local or network, that persist even after the folder itself is gone or disconnected. Parsed with `SBECmd` against the victim's own `NTUSER.DAT` (recorded there because his session was active during the browse), the full chain showed directly: a network location pointing at a completely different hostname than the infected workstation, the analyst's own separate machine, down through his account, his Desktop, a triage folder, and a tools folder.

**Answer:** \\DESKTOP-887GK2L\Users\CyberJunkie\Desktop\Forela-Triage-Workstation\Acquisiton and Triage tools

---

## The Full Story

Simon Stark wanted to stream coding sessions with colleagues. He searched for streaming software, clicked a Google-Ads-promoted result for a typosquat of the real OBS Studio site, and downloaded what he had every reason to believe was legitimate software. It was, partly, the installer genuinely deploys real OBS Studio, which is exactly why the compromise went unnoticed. Underneath, it also dropped a deliberately oversized backdoor with a randomized name into an equally randomized folder, set up a scheduled task disguised as a recognizable Windows process for persistence, beaconed out to a domain-generation-algorithm-produced C2 domain, and staged an exfiltration channel to an S3 bucket. Days later, a security analyst triaged the infected workstation with KAPE, run from a network share hosted on a separate analyst machine.

Almost none of this showed up where it should have on paper, browser history was clean, Prefetch traces for the acquisition tools themselves were incomplete, and the final answer required an artifact category the case never needed until the very last question.

---

## Indicators of Compromise

| Type | Value |
|---|---|
| Malicious domain | obsproicet.net (typosquat of obsproject.com) |
| Full download URL | http://obsproicet.net/download/v28_23/OBS-Studio-28.1.2-Full-Installer-x64.zip |
| Hosting IP | 13.232.96.186 |
| Setup file SHA-1 | 35e3582a9ed14f8a4bb81fd6aca3f0009c78a3a1 |
| Backdoor size | ~1.1 GB (deliberately bloated to exceed sandbox/AV size limits) |
| Backdoor Prefetch hash | D8A6D943 |
| Persistence | Scheduled Task, COMSurrogate |
| DGA C2 domain | oaueeewy3pdy31g3kpqorpc4e.qopgwwytep |
| Exfil destination | bbuseruploads.s3.amazonaws.com |
| Victim host | forela-wkstn001 |
| Analyst account / machine | CyberJunkie / DESKTOP-887GK2L |

---

## Key Takeaways

- **Browser history being clean doesn't mean the download wasn't a browser download.** The trail survived instead in the `:Zone.Identifier` Alternate Data Stream (Mark of the Web), a filesystem-level artifact independent of whatever the browser's own history recorded.
- **A file's MFT entry and sequence number are stable across a rename**, useful for tracing a cached LNK target to its current name, but the timestamp of *when* the rename happened needs the USN Journal's explicit rename events, not just the first plausible-looking timestamp column.
- **A suspicious-looking artifact isn't automatically the right one.** Two strong backdoor candidates here were both wrong, one was persistence, the other predated the incident entirely. Timestamps against the actual infection window are what separated real evidence from coincidence.
- **When a log's timestamps don't match a tool's, don't force the filter, solve for the offset.** Cross-referencing two independently-known events against the log confirmed a timezone gap in minutes, not hours of guessing.
- **Filtering by volume is the wrong instinct when hunting one anomalous entry.** The rare Event IDs, not the ones firing thousands of times a minute, are what actually isolate an outlier.
- **When repeated attempts fail despite solid evidence, the problem is usually the artifact category, not the reading of it.** The final task wasn't answerable from anything used elsewhere in the case, it needed ShellBags specifically.

---

## Detection Opportunities

- Flag scheduled tasks whose names closely mimic legitimate Windows process names (`COMSurrogate` vs. the real "COM Surrogate"/`dllhost.exe`) and cross-check their creation time against install/execution activity on the same host.
- Alert on executables that grossly exceed typical size norms for their apparent function, a multi-hundred-megabyte-to-gigabyte binary sitting in a user profile folder is itself a signal, independent of hash reputation.
- Monitor DNS query volume and pattern per host, a burst of thousands of queries to random-looking hostnames in a short window is a DGA C2 fingerprint even before any single domain is flagged as malicious.
- Treat Mark-of-the-Web (`:Zone.Identifier`) survivorship as a durable download-provenance source that's harder for an attacker or a cleanup script to erase than browser history.
- Track network locations recorded in ShellBags as a source of truth for cross-host file/tool staging activity, especially during incident response itself, since the response tooling's own footprint is evidence too.

---

## Quick Answer Reference

| # | Task | Answer |
|---|---|---|
| 1 | Original malicious zip filename | OBS-Studio-28.1.2-Full-Installer-x64.zip |
| 2 | Renamed zip, full path | C:\Users\Simon.stark\Documents\Streaming Software\Obs Streaming Software.zip |
| 3 | Rename timestamp | 2023-05-05 10:22:23 |
| 4 | Full download URL | http://obsproicet.net/download/v28_23/OBS-Studio-28.1.2-Full-Installer-x64.zip |
| 5 | Hosting IP | 13.232.96.186 |
| 6 | Highest source port | 50045 |
| 7 | Setup file SHA-1 | 35e3582a9ed14f8a4bb81fd6aca3f0009c78a3a1 |
| 8 | Backdoor name + filepath | C:\Users\Simon.stark\Miloyeki ker konoyogi\lat takewode libigax weloj jihi quimodo datex dob cijoyi mawiropo.exe |
| 9 | Backdoor Prefetch hash | D8A6D943 |
| 10 | Persistence mechanism | COMSurrogate |
| 11 | Bogus C2 domain | oaueeewy3pdy31g3kpqorpc4e.qopgwwytep |
| 12 | S3 exfil URL | bbuseruploads.s3.amazonaws.com |
| 13 | Week 1 stream topic | FileSystem Security |
| 14 | Security Analyst name | CyberJunkie |
| 15 | UNC path of acquisition tools | \\DESKTOP-887GK2L\Users\CyberJunkie\Desktop\Forela-Triage-Workstation\Acquisiton and Triage tools |
