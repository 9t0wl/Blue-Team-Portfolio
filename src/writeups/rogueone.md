# HTB Sherlock: RogueOne — Full Writeup

**Category:** DFIR / Memory Forensics | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** 10 September 2026

---

## TL;DR

Forela's SIEM fired multiple C2 alerts in under a minute from Simon Stark's workstation. Task Manager showed nothing wrong — because the malware was hiding in plain sight, running under the name `svchost.exe` from `C:\Users\simon.stark\Downloads\`, not the real Service Host in `System32`. It called back to a hardcoded C2 (`13.127.155.166:8888`) in the same second it launched, then spawned `cmd.exe` to give the attacker command execution. VirusTotal identified the sample as a Metasploit-family stager (`trojan.rozena`) — a reflective loader that manually walks the PEB and resolves Windows APIs via ROR13 hashing instead of using an Import Address Table, the exact technique behind Meterpreter stagers. The entire investigation ran off a single memory image using Volatility3, fed into a purpose-built browser triage tool (`vol-triage.html`) — and working this box directly motivated extending that tool's default plugin set.

---

## Scenario

> Your SIEM system generated multiple alerts in less than a minute, indicating potential C2 communication from Simon Stark's workstation. Despite Simon not noticing anything unusual, the IT team had him share screenshots of his task manager to check for any unusual processes. No suspicious processes were found, yet alerts about C2 communications persisted. The SOC manager then directed the immediate containment of the workstation and a memory dump for analysis. As a memory forensics expert, you are tasked with assisting the SOC team at Forela to investigate and resolve this urgent incident.

---

## Attack Timeline

All times UTC, from process `CreateTime` and `netscan` connection timestamps (memory image `20230810.mem`).

| Time (UTC) | Event | Source |
|---|---|---|
| 11:20:21 | `msedgewebview2.exe` (PID 1576) launches, embedded by `WinRAR.exe` (PID 5864) for its built-in ad/notification feature — spawns its normal Chromium subprocess family (crashpad-handler, renderer, gpu-process, utility network/storage) | `windows.pstree` |
| 11:27:15 | `cmd.exe` (PID 8260, PPID 936) launched — unrelated to the intrusion, not investigated further (see Open Threads) | `windows.pstree` |
| 11:29:25 | `SearchProtocolHost.exe` (PID 8428) — legitimate Windows Search Filter Host, initially flagged as a false positive | `windows.pstree` |
| **11:30:03** | **Malicious `svchost.exe` (PID 6812, PPID 7436) executes from `Downloads`** *and* establishes its C2 connection to `13.127.155.166:8888` — same second, no delay | `windows.pstree`, `windows.netscan` |
| 11:30:57 | `cmd.exe` (PID 4364) spawned as a direct child of the malicious `svchost.exe` — the attacker's command-execution channel | `windows.pstree` |
| 11:58:10 | Sample first submitted to VirusTotal — ~28 minutes after execution, consistent with the reverse-engineering team uploading it during real-time response (matches Task 7's own narrative) | VirusTotal |

---

## Environment Details

| Fact | Value | How it was found |
|---|---|---|
| Affected user | `simon.stark` | Process working paths (`Downloads`, WebView2 user-data-dir) |
| Local IP | `172.17.79.131` | `windows.netscan` |
| Malicious file path | `C:\Users\simon.stark\Downloads\svchost.exe` | `windows.filescan` |
| Memory image | `20230810.mem` | Provided; date matches all process `CreateTime`s (2023-08-10) |

OS build/hostname weren't required by any task and weren't independently pulled this session — all seven questions resolved directly off process, network, and file-object data.

---

## Methodology & Tooling

### Getting into the image

The provided zip failed a plain `unzip` with `unsupported compression method 99` — a WinZip-AES-encrypted archive, which `unzip` can't handle. Extracted with `7z x RogueOne.zip` instead, using the standard HTB Sherlock password.

### Core Volatility3 plugin set → CSV → browser triage

```bash
vol -f 20230810.mem -r csv windows.info     > info.csv
vol -f 20230810.mem -r csv windows.pstree   > pstree.csv
vol -f 20230810.mem -r csv windows.cmdline  > cmdline.csv
vol -f 20230810.mem -r csv windows.netscan  > netscan.csv
vol -f 20230810.mem -r csv windows.filescan > filescan.csv
```

Loaded each into [`vol-triage.html`](https://github.com/9t0wl/dfir-tools) (single-file, browser-only tool from the `dfir-tools` repo) instead of grepping raw terminal output — the pstree CSV alone had 145 rows, filescan had 11,708. The tool auto-detects table shape from the CSV header (process/network/registry/info), gives sortable/filterable columns, click-any-PID cross-referencing between tabs, and keyword-based flagging (LOLBins as "Review," encoded-command/temp-path indicators as "Critical").

### The false-positive detour — and what it taught

Loading pstree with "Hide common system noise" + "Critical/Review only" checked narrowed 145 rows to 9. Two of those nine were **false positives**, both worth understanding rather than just dismissing:

- **`SearchProtocolHost.exe`** flagged CRITICAL only because its legitimate working-directory argument (`C:\ProgramData\Microsoft\Search\Data\Temp\usgthrsvc`) contains `\Temp\`, matching the tool's keyword list. This is the real Windows Search Filter Host — its command-line shape (`Global\UsGthrFltPipeMssGthrPipe3_...`, the fake "MS Search 4.0 Robot" user-agent) is standard and unremarkable.
- **The `WinRAR.exe` (5864) → `msedgewebview2.exe` (1576) chain**, and its full Chromium subprocess family (`crashpad-handler`, `--type=renderer`, `--type=gpu-process`, `--type=utility` for network/storage services), is normal multi-process browser architecture. WinRAR's free build legitimately embeds WebView2 for ads/notifications — this whole tree was flagged only via the same keyword coincidence, not a real indicator.

**The actual signal was two `cmd.exe` processes** (PID 8260/PPID 936, PID 4364/PPID 6812) flagged REVIEW as LOLBins — but *neither of their parent PIDs appeared anywhere in the filtered view*, meaning the real story was sitting one level up, invisible under the default filters. That's because `vol-triage.html`'s noise-hiding list matches `svchost.exe` **by name only**, with no path check — exactly the blind spot a masquerading binary is built to exploit. Clearing both filters and searching `6812` directly surfaced it.

This gap is now logged as a planned improvement: flag any process whose name matches a known-system-binary noise entry but whose path isn't under `System32` as an automatic CRITICAL, rather than requiring a manual filter-clear to find it.

---

## Investigation — Every Task, Every Command

### Task 1 — Malicious Process + PID
**Answer: `6812`**

```
vol -f 20230810.mem -r csv windows.pstree > pstree.csv
```
Filtering pstree to `6812`:

| TreeDepth | PID | PPID | ImageFileName | Offset(V) | CreateTime | Path |
|---|---|---|---|---|---|---|
| 3 | 6812 | 7436 | `svchost.exe` | `0x9e8b87762080` | 2023-08-10 11:30:03 UTC | `C:\Users\simon.stark\Downloads\svchost.exe` |

Two independent tells confirm this is malicious, not the real Service Host:

1. **Path.** The genuine Windows `svchost.exe` only ever runs from `C:\Windows\System32\`. A binary can be renamed to anything; it can't fake its own filesystem location. This is MITRE ATT&CK **T1036.005 — Masquerading: Match Legitimate Name or Location**.
2. **Parentage.** Real `svchost.exe` is only ever spawned by `services.exe` (the Service Control Manager) — never launched from a user's Downloads folder, which implies manual or browser-driven execution instead.

### Task 2 — Child Process PID
**Answer: `4364`**

Same pstree data, filtered to PPID `6812`:

| TreeDepth | PID | PPID | ImageFileName | Offset(V) | CreateTime | Path |
|---|---|---|---|---|---|---|
| 4 | 4364 | 6812 | `cmd.exe` | `0x9e8b8b6ef080` | 2023-08-10 11:30:57 UTC | `C:\WINDOWS\system32\cmd.exe` |

A direct child of the fake `svchost.exe`, launched 54 seconds after it — the shell that gave the threat actor command execution.

### Task 3 — MD5 Hash of the Malicious File
**Answer: `5bd547c6f5bfc4858fe62c8867acfbb5`**

```bash
vol -f 20230810.mem -r csv windows.filescan > filescan.csv
# filtered to "downloads": two FILE_OBJECTs for the same path
#   0x9e8b909045d0  \Users\simon.stark\Downloads\svchost.exe
#   0x9e8b91ec0140  \Users\simon.stark\Downloads\svchost.exe

vol -f 20230810.mem windows.dumpfiles --virtaddr 0x9e8b909045d0
vol -f 20230810.mem windows.dumpfiles --virtaddr 0x9e8b91ec0140
```
Both runs: `DataSectionObject` → "Error dumping file" (nothing ever read the file as raw data — only executed it, so that section wasn't resident). `ImageSectionObject` → succeeded for both (this backs the file *as mapped for execution*, guaranteed resident since PID 6812 was actively running from it).

```bash
md5sum file.0x9e8b909045d0.0x9e8b957f24c0.ImageSectionObject.svchost.exe.img
md5sum file.0x9e8b91ec0140.0x9e8b957f24c0.ImageSectionObject.svchost.exe.img
# 5bd547c6f5bfc4858fe62c8867acfbb5  (both, identical)
```
Two independent `FILE_OBJECT`s (likely one from initial write-to-disk, one from execution) reconstructing to byte-identical images is real corroborating evidence — it rules out the file being swapped between those two opens, a technique some droppers use to dodge scan-on-write AV.

### Task 4 — C2 IP Address and Port
**Answer: `13.127.155.166:8888`**

```bash
vol -f 20230810.mem -r csv windows.netscan > netscan.csv
```
Filtered to PID `6812`:

| Proto | LocalAddr | LocalPort | ForeignAddr | ForeignPort | State | Owner | Created |
|---|---|---|---|---|---|---|---|
| TCPv4 | 172.17.79.131 | 64254 | 13.127.155.166 | 8888 | ESTABLISHED | svchost.exe | 2023-08-10 11:30:03 UTC |

Filtered by PID, not by name — `cmd.exe` doesn't own its own sockets, its parent process does.

### Task 5 — Timeline (Execution + C2 Established)
**Answer: `10/08/2023 11:30:03`**

The fake `svchost.exe`'s process `CreateTime` and its `netscan` connection's `Created` timestamp are the **same second**. Process execution and C2 connection happened simultaneously — a stager calling home immediately on launch, not a delayed/jittered beacon.

### Task 6 — Memory Offset of the Malicious Process
**Answer: `0x9e8b87762080`**

The `Offset(V)` column from the Task 1 pstree row — the **process object** offset, distinct from the two *file* object offsets used in Task 3.

### Task 7 — First VirusTotal Submission Date
**Answer: `10/08/2023 11:58:10`**

Submitted the Task-3 MD5 to VirusTotal. Key findings:

| Field | Value |
|---|---|
| Detections | 59 / 71 vendors |
| Popular threat label | `trojan.rozena/metasploit` |
| Family labels | rozena, metasploit, gen7 |
| SHA256 | `eaf09578d6eca82501aa2b3fcef473c3795ea365a9b33a252e5dc712c62981ea` |
| File size | 10.00 KB (10,240 bytes) |
| PE Creation Time (linker timestamp) | 2010-04-14 22:06:53 UTC |
| First Seen In The Wild | 2023-08-11 23:23:31 UTC |
| **First Submission** | **2023-08-10 11:58:10 UTC** |

VT's **Details** tab (not the Detection tab's "Last Analysis Date," which only reflects the most recent re-scan) carries the dedicated "First Submission" field.

**Code Insights (VT):** the sample is a malicious loader/stager exhibiting classic shellcode behavior — manually walking the Process Environment Block (PEB) and resolving Windows APIs via **ROR13 hashing** instead of an Import Address Table (defeats static-import AV signatures), referencing `ws2_32` (Winsock, network capability), and allocating an RWX section that it copies a payload into and jumps to — a textbook `VirtualAlloc` → copy → jump reflective-loader pattern.

---

## The Full Story

The whole incident traces back to one masquerading binary: a Metasploit-derived stager, named `svchost.exe` and dropped into `C:\Users\simon.stark\Downloads\`, that fooled Simon's own Task Manager review exactly the way it was designed to — a familiar system name is enough for a human glancing down a process list, even though its *location* gives it away instantly to anyone who checks. The moment it executed, it called back to a hardcoded C2 (`13.127.155.166:8888`) with zero delay — consistent with a stage-0 loader whose only job is to establish contact and pull the next stage, not a mature implant designed to blend into normal beaconing patterns. Once connected, it spawned `cmd.exe` as a direct child fifty-four seconds later, handing the operator interactive command execution.

VirusTotal's behavioral analysis independently confirms what the process tree implied: this is architecturally a Meterpreter/msfvenom-style stager. PEB-walking and ROR13 hash-based API resolution are exactly how Metasploit payloads avoid needing a static import table (the classic way AV/EDR fingerprints a PE), and the RWX-allocate-copy-jump sequence is the same shellcode-loading pattern behind any staged Meterpreter payload. The sample's hash was submitted to VirusTotal only 28 minutes after it executed — almost certainly the reverse-engineering team uploading it in the middle of live incident response, exactly as Task 7's own narrative describes, not some independent external sighting.

The investigation's real friction wasn't finding the malware — it was **getting past two convincing false leads first**. Both the legitimate Windows Search component and WinRAR's own embedded-browser ad feature tripped the same keyword-based flagger that caught the real threat, for the same shallow reason (a `\Temp\` substring match). The actual tell only surfaced by following the "parent, not child" principle down to its logical end: two flagged `cmd.exe` LOLBins whose *parents* weren't flagged at all, because the triage tool's own noise-filter matches process names, not paths — the same blind spot the malware itself was built to exploit against a human analyst.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| MD5 | `5bd547c6f5bfc4858fe62c8867acfbb5` | Malicious `svchost.exe`, confirmed via two independent memory-resident copies |
| SHA256 | `eaf09578d6eca82501aa2b3fcef473c3795ea365a9b33a252e5dc712c62981ea` | Same sample, from VirusTotal |
| C2 | `13.127.155.166:8888` | ESTABLISHED TCPv4, immediate connection on process launch |
| File path | `C:\Users\simon.stark\Downloads\svchost.exe` | Masquerades as the legitimate Service Host by name only |
| PID | `6812` (PPID 7436) | Malicious process; parent (7436) not identified this session |
| PID | `4364` (PPID 6812) | `cmd.exe` — attacker command-execution channel |
| Threat label | `trojan.rozena/metasploit` | VirusTotal popular threat label / family tags |
| Compromised host | `simon.stark` / `172.17.79.131` | |

---

## Key Takeaways

- **Path beats name for validating a claimed system binary.** The real `svchost.exe` only lives in `System32` — a masquerade can fake the name, never the location (MITRE T1036.005).
- **Parentage matters as much as path.** Legitimate `svchost.exe` is only ever spawned by `services.exe`; anything else means it isn't really the Service Host, regardless of what it's named.
- **Keyword/name-based flagging has a real blind spot, in any tool — including this one.** A noise-allowlist keyed on process *name* can hide a masquerading binary that borrowed a common name on purpose. This is precisely the trick that fooled Simon's own Task Manager review in the scenario itself.
- **The tell in a process tree is sometimes the unflagged parent of a flagged child**, not the flagged row itself. Both suspicious `cmd.exe` launches here had parents invisible under the default filter.
- **Two independent memory structures producing byte-identical dumps is real corroborating evidence**, not a formality — it rules out the file being modified/swapped between separate opens.
- **`windows.dumpfiles`'s `DataSectionObject` vs. `ImageSectionObject` distinction matters.** A failed `DataSectionObject` dump doesn't mean the file is unrecoverable — the `ImageSectionObject` backing an actively-executing image is often still resident and is actually the more relevant artifact for a running malicious process.
- **Simultaneous process execution and outbound connection is itself a timeline signal.** A stager with no sleep/jitter before first call-home reads very differently from a mature, evasive implant.
- **PE linker timestamps are attacker-controlled and unreliable for dating a sample.** This sample's compile timestamp (2010) predates its actual first submission (2023) by 13 years — use VirusTotal's First Submission/First Seen In The Wild instead of the PE header for real timeline work.
- **A file hash is a pivot, not an endpoint.** VirusTotal's behavioral code insights (PEB-walking, ROR13 hashing, RWX allocation) independently confirmed the malware family and technique — ties the SOC-side finding straight back to how these stagers are actually built offensively.

---

## Detection Opportunities

- Alert on any process named after a well-known Windows system binary (`svchost.exe`, `csrss.exe`, `lsass.exe`, etc.) running from a path outside `%SystemRoot%\System32` — close to a zero-false-positive rule.
- Alert on `svchost.exe` (or equivalent) whose parent process isn't `services.exe`.
- Flag a process establishing an outbound connection within seconds of its own creation, especially to a non-standard high port — real stagers frequently skip the sleep/jitter mature implants use.
- Don't rely solely on name-based allowlists in tooling or SOC playbooks (including triage scripts) — pair every name check with a path/parent validation, exactly the gap this box's own tool had.
- User-facing "check your Task Manager" containment steps are a weak control on their own — a masquerading process defeats visual review by design; pair it with automated path/hash verification.

---

## Open Threads (not required by any task, worth noting)

- **PID 7436** (parent of the malicious `svchost.exe`) was never identified this session — likely the actual delivery vector (browser download or the WinRAR chain), but not confirmed.
- **PID 8260 / PPID 936** (the other flagged `cmd.exe`, launched at 11:27:15, before the intrusion began) was not investigated — very likely unrelated legitimate user activity, but not independently confirmed.

---

## Tools Used / Extended

[`vol-triage.html`](https://github.com/9t0wl/dfir-tools) — browser-based Volatility3 CSV triage tool. Working this box directly motivated two changes:
- Extended the tool's "Start Here" default plugin set with `pslist`/`psscan` (hidden-process pairing), `malfind`, `dlllist`, and `svcscan`.
- Identified a needed improvement (not yet built): flag any process whose name matches a known-system-binary noise entry but whose path isn't under `System32` as automatic CRITICAL, rather than requiring a manual filter-clear to find it.

---

## Quick Answer Reference

| # | Question | Answer |
|---|---|---|
| 1 | Malicious process + PID | `svchost.exe`, PID `6812` |
| 2 | Child process PID (command execution) | `4364` |
| 3 | MD5 hash of malicious file | `5bd547c6f5bfc4858fe62c8867acfbb5` |
| 4 | C2 IP address and port | `13.127.155.166:8888` |
| 5 | Timeline (execution + C2 established) | `10/08/2023 11:30:03` |
| 6 | Memory offset of malicious process | `0x9e8b87762080` |
| 7 | First VirusTotal submission date | `10/08/2023 11:58:10` |
