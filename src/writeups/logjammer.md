# HTB Sherlock: LogJammer — Full Writeup

**Category:** DFIR / Windows Event Log Analysis | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** 10 September 2026

---

## TL;DR

A "junior DFIR consultant technical assessment" from the fictional consultancy Forela-Security: reconstruct what user `CyberJunkie` did on `DESKTOP-887GK2L` using nothing but five exported Windows event logs — Security, System, PowerShell-Operational, Defender-Operational, and Firewall-Firewall. No disk image, no memory dump.

The chain that falls out of the logs: `CyberJunkie` downloaded SharpHound (BloodHound's AD-recon collector) straight from GitHub's release CDN, got a partial catch from Defender — quarantine was attempted but silently failed — added a firewall rule bluntly named **"Metasploit C2 Bypass"** to let a callback on port 4444 through, tampered with the audit policy in a way that incidentally exposed their own next move, created a scheduled task to persist a PowerShell script, hash-verified that script by hand, and then cleared two separate event logs (Sysmon and Firewall) to cover their tracks — leaving behind the exact artifacts that prove the cover-up happened.

---

## Scenario

> You have been presented with the opportunity to work as a junior DFIR consultant for a big consultancy. However, they have provided a technical assessment for you to complete. The consultancy Forela-Security would like to gauge your knowledge of Windows Event Log Analysis. Please analyse and report back on the questions they have asked.

---

## Methodology & Tooling

Worked entirely through **EZ Tools** (EvtxECmd → CSV → Timeline Explorer) rather than Chainsaw, to build fluency across both toolchains.

```
EvtxECmd.exe -d "D:\Sherlock\logjammer\Event-Logs" --csv "D:\Sherlock\logjammer\Output" --csvf logjammer_combined.csv
```

`-d` recurses the whole `Event-Logs` folder and merges all 5 `.evtx` files into **one** combined CSV — essential here, since several answers required cross-referencing timestamps and Process IDs across different logs (e.g. correlating the Firewall C2 rule with the Defender Meterpreter detections). EvtxECmd's own "Administrator privileges not found!" warning is a red herring for exported/copied `.evtx` files — it only matters against live logs under `C:\Windows\System32\winevt\Logs`. Everything from here on was filtering and cell-inspection inside Timeline Explorer.

---

## Investigation — Every Task, Every Command

### Task 2 & 3 — Firewall Rule Added + Direction

Filtered `Event Id = 2004` (firewall rule added, `Microsoft-Windows-Windows Firewall With Advanced Security/Firewall` log) `And Payload Data4 Contains Allow`. One row stood out immediately among the noise of legitimate Edge/Defender/Firefox rules:

| Field | Value |
|---|---|
| Rule name | `Metasploit C2 Bypass` |
| Protocol | TCP |
| Port | 4444 |
| Direction | `2` |
| Action | Allow |

Port 4444 is Metasploit's default listener port — the rule's own name gives the intent away outright.

**Direction** values come from the Windows Firewall API's `NET_FW_RULE_DIRECTION` enum: `1` = Inbound, `2` = Outbound, `3` = `NET_FW_RULE_DIR_MAX` — an internal API boundary marker, not a real traffic direction.

**Answers:** rule name `Metasploit C2 Bypass` · direction `Outbound`

### Task 4 — Audit Policy Change

`Event Id = 4719` ("System audit policy was changed", Security log). Payload carried `SubcategoryGuid: 0CCE9227-69AE-11D9-BED3-505054503030`, which maps to the **"Other Object Access Events"** subcategory (Object Access category) — cross-checked against Microsoft's own 4719 documentation (shares the same `CategoryId` as their published example, which resolves one GUID slot earlier in the same block) and against Ultimate Windows Security's docs for a second independent data point.

This subcategory is the specific one that governs **Scheduled Task auditing (Event IDs 4698-4702)** — enabling it is what made the next finding (Task 5) loggable at all.

**Answer:** `Other Object Access Events`

### Task 5, 6 & 7 — Scheduled Task Created

`Event Id = 4698`. `TaskName` came through as a clean top-level field: `\HTB-AUTOMATION`. But the task's actual command and arguments weren't top-level fields at all — they were buried inside a full Task Scheduler task-definition XML, HTML-entity-encoded, packed into a single payload Data element. Had to open the raw, unmapped `Payload` column (Timeline Explorer's "Cell contents" popup) and read the decoded XML directly:

```xml
<Command>C:\Users\CyberJunkie\Desktop\Automation-HTB.ps1</Command>
<Arguments>-A cyberjunkie@hackthebox.eu</Arguments>
```

**Answers:** task name `\HTB-AUTOMATION` · file path `C:\Users\CyberJunkie\Desktop\Automation-HTB.ps1` · arguments `-A cyberjunkie@hackthebox.eu`

### Task 8, 9 & 10 — Antivirus Detection

`Windows Defender-Operational.evtx`, `Event Id = 1117` ("Action taken"). Two distinct clusters in the same log:

- `CyberJunkie` → `HackTool:MSIL/SharpHound!MSR` (Tool, High)
- `NT AUTHORITY\SYSTEM` → `Trojan:Win64/Meterpreter.B` (Severe), many rows — correlating directly to the Metasploit C2 firewall rule from Task 2. Two independent log sources confirming the same C2 activity.

Full path, from the same 1117 payload's `Path` field: `C:\Users\CyberJunkie\Downloads\SharpHound-v1.1.0.zip` → `SharpHound.exe`. The payload's `webfile` URL showed the download came straight from `objects.githubusercontent.com` — GitHub's own release CDN, not a sketchy mirror. Living-off-trusted-infrastructure: that domain rarely gets blocked by egress filtering.

Action taken: `Action Name: Quarantine` — but immediately followed in the same payload by `Error Code: 0x80508023`, `Error Description: The program could not find the malware and other potentially unwanted software on this device.` The quarantine was *attempted*, not *successful* — by the time Defender tried to act, it couldn't re-locate the file. A real forensic finding, not trivia: the binary likely survived on disk past the detection timestamp.

**Answers:** malware `HackTool:MSIL/SharpHound!MSR` · path `C:\Users\CyberJunkie\Downloads\SharpHound-v1.1.0.zip` · action `Quarantine` (attempted, failed)

### Task 11 — PowerShell Command Executed

The hard one, and a lesson in not trusting a targeted filter's silence:

1. Filtered `Event Id = 4104` (Script Block Logging) with a text search for "CyberJunkie" → zero results. Wrongly concluded Script Block Logging wasn't enabled for this session.
2. Found two `Event Id = 4100` rows (`Command Name: Invoke-WebRequest`) — turned out to be **failed connection attempts** (`WebCmdletWebResponseException`), an unrelated dead end.
3. Found `Event Id = 4103` (Module Logging) `ParameterBinding(Get-FileHash)` sub-events (`Algorithm=md5`, `Path=.\Desktop\Automation-HTB.ps1`) and reconstructed a guessed command from the binding order — submitted, rejected.
4. Cleared every filter and ran a raw global text search for `hash` across the whole combined CSV. This surfaced the actual `Event Id = 4104` `ScriptBlockText` event that step 1 had missed entirely — that event schema apparently doesn't carry a matching `User Name` field the way 4103 does, so the earlier username filter silently excluded it.

The verbatim `ScriptBlockText`:

```
Get-FileHash -Algorithm md5 .\Desktop\Automation-HTB.ps1
```

**Lesson:** when a targeted user/keyword filter returns nothing — or drives a wrong reconstructed answer — don't trust that the event doesn't exist. Clear the filter and search broadly instead; not every event schema populates the field you were filtering on.

**Answer:** `Get-FileHash -Algorithm md5 .\Desktop\Automation-HTB.ps1`

### Task 12 — Cleared Event Log

Two different "log cleared" event IDs exist, easy to conflate:

| ID | Scope | Behavior |
|---|---|---|
| `1102` | Security log only | "The audit log was cleared" — hardcoded to always fire in the Security channel, regardless of which log an attacker actually meant to hide. |
| `104` | Any channel | "The log file was cleared" — generic, fires in whichever channel actually got cleared. |

First found `1102` and submitted `Security` — rejected. Switched to a broad `Event Id = 104` search across every channel and found **two** separate clears:

- `Microsoft-Windows-Sysmon/Operational` — cleared **13 separate times**. This also explains why the original evidence package never included a `Sysmon.evtx` at all: the log itself is gone, and this 104 remnant is the only proof it ever existed. Thirteen distinct clears points to repeated scrubbing across the intrusion, not one cleanup pass.
- `Microsoft-Windows-Windows Firewall With Advanced Security/Firewall` — the graded answer, and it closes the loop cleanly: they added the C2 bypass rule (Task 2), then cleared the one log that would show they'd done it.

**Answer:** `Microsoft-Windows-Windows Firewall With Advanced Security/Firewall`

---

## The Full Story

`CyberJunkie` downloads SharpHound directly from GitHub's release CDN for AD reconnaissance. Defender flags it almost immediately as `HackTool:MSIL/SharpHound!MSR` and attempts quarantine — but the remediation fails, leaving the tool viable on disk. A separate wave of `Trojan:Win64/Meterpreter.B` detections, attributed to `NT AUTHORITY\SYSTEM`, points to a Metasploit payload already active in parallel; a firewall rule literally named "Metasploit C2 Bypass" is added shortly after, opening TCP/4444 outbound — the exact port a default Meterpreter listener uses.

The audit policy gets modified next, enabling the "Other Object Access Events" subcategory — which incidentally turns on logging for Task Scheduler, the very mechanism used moments later to persist a PowerShell script (`\HTB-AUTOMATION`, running `Automation-HTB.ps1` with an email-address argument). `CyberJunkie` manually hashes that script with `Get-FileHash`, likely a self-verification step.

Then the cleanup: the Sysmon log is wiped thirteen separate times over the course of the intrusion, and the Firewall log is cleared once — specifically erasing the evidence trail for the C2 bypass rule. Despite that, both clear events themselves and everything logged *after* each clear survived intact. Clearing a log mid-operation doesn't buy retroactive cover; it only creates a gap up to the clear point.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| Malware (AV label) | `HackTool:MSIL/SharpHound!MSR` | BloodHound's AD-recon collector |
| Malware (AV label) | `Trojan:Win64/Meterpreter.B` | Multiple detections, `NT AUTHORITY\SYSTEM` |
| File path | `C:\Users\CyberJunkie\Downloads\SharpHound-v1.1.0.zip` → `SharpHound.exe` | Downloaded from `objects.githubusercontent.com` (real GitHub release CDN) |
| Scheduled task | `\HTB-AUTOMATION` | `C:\Users\CyberJunkie\Desktop\Automation-HTB.ps1 -A cyberjunkie@hackthebox.eu` |
| Firewall rule | `Metasploit C2 Bypass` | TCP/4444, Outbound, Allow |
| Cleared logs | `Microsoft-Windows-Sysmon/Operational` (×13), `Microsoft-Windows-Windows Firewall With Advanced Security/Firewall` (×1) | Anti-forensics |
| Compromised user | `CyberJunkie` / `DESKTOP-887GK2L` | |

---

## Key Takeaways

- **Log source splits matter.** Firewall telemetry alone spans two different logs — `5156`/`5157`/`5031` in Security vs. `2004`/`2005`/`4946-4950` in the Advanced Security/Firewall operational log. Point a filter at the wrong file and it returns silent nothing, not an error.
- **"Log cleared" has more than one right-shaped answer.** `1102` (Security-only) and `104` (any channel) both fire on a clear; a room — or a real investigation — can care about a *specific* cleared channel that fits the attack narrative, not just the first or most-cleared one found.
- **A targeted filter's silence isn't proof of absence.** The Script Block Logging miss here came from filtering on a field a particular event schema simply didn't populate — a broad content search found what the targeted one hid.
- **Payload columns go deeper than the mapped fields show.** Scheduled-task Command/Arguments, full ScriptBlockText, and log-clear Channel/BackupPath all live inside a raw, unmapped `Payload` column separate from the individually-broken-out fields a parser exposes by default.
- **`Level: LogAlways`** on Security-Auditing events is a manifest severity classification, unrelated to whether the governing audit subcategory was enabled — easy to misread as "this event always logs regardless of policy," which is only actually true for a handful of specifically hardcoded events.
- **Anti-forensics is partially self-defeating.** Clearing a log mid-operation only erases what came before the clear — the clear event itself, and everything logged after it, survive.

---

## Detection Opportunities

- Alert on any firewall rule addition (`2004`) whose rule name references known offensive tooling, or whose port/direction combination matches a common C2 default (4444, 4445, 8080, etc.) with Action = Allow.
- Alert on `4719` audit policy changes generally — legitimate changes are rare enough in most environments to warrant review every time, especially outside a documented maintenance window.
- Correlate scheduled-task creation (`4698`) with any preceding `4719` that enabled the "Other Object Access Events" subcategory — a near-simultaneous pairing is worth flagging on its own.
- Treat a Defender "Action taken" event with a non-success `Error Code` as an open finding, not a closed one — a logged Quarantine attempt doesn't guarantee the file is actually gone.
- Alert on **any** `104` (log cleared) event outside planned maintenance, across every channel — not just Security's `1102`. A SOC watching only Security-log clears misses exactly the Sysmon/Firewall clears that mattered in this room.

---

## Quick Answer Reference

| # | Task | Answer |
|---|---|---|
| 2 | Firewall rule name added | `Metasploit C2 Bypass` |
| 3 | Rule direction | `Outbound` |
| 4 | Audit policy subcategory changed | `Other Object Access Events` |
| 5 | Scheduled task name | `\HTB-AUTOMATION` |
| 6 | Scheduled task file path | `C:\Users\CyberJunkie\Desktop\Automation-HTB.ps1` |
| 7 | Scheduled task arguments | `-A cyberjunkie@hackthebox.eu` |
| 8 | Malware identified by AV | `HackTool:MSIL/SharpHound!MSR` |
| 9 | Malware full path | `C:\Users\CyberJunkie\Downloads\SharpHound-v1.1.0.zip` |
| 10 | AV action taken | `Quarantine` (attempted, failed) |
| 11 | PowerShell command executed | `Get-FileHash -Algorithm md5 .\Desktop\Automation-HTB.ps1` |
| 12 | Cleared event log | `Microsoft-Windows-Windows Firewall With Advanced Security/Firewall` |
