# HTB Sherlock: Tracer, Full Writeup

**Category:** DFIR / Endpoint Forensics (Lateral Movement) | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** 11 September 2026

---

## TL;DR

A junior SOC analyst reports multiple alerts for PsExec on a workstation, verifies them, and escalates to Tier II. The job: triage the endpoint and answer exactly what the incident manager needs to know, how many times PsExec ran, what it dropped, when a specific historical session ran, which workstation this actually was, and the files and named pipes one particular session left behind.

No exploitation chain here, just cross-referencing three artifact types (prefetch, Windows Event Logs, the USN Journal) against each other, and against a target that kept shifting under investigation: the workstation had three different hostnames baked into its own logs over its lifetime, and two of the three artifact types silently cap how much execution history they retain.

---

## Scenario

> A junior SOC analyst on duty has reported multiple alerts indicating the presence of PsExec on a workstation. They verified the alerts and escalated the alerts to tier II. As an Incident responder, you triaged the endpoint for artifacts of interest. Now, please answer the questions regarding this security event so you can report it to your incident manager.

---

## Methodology & Tooling

Built the whole EZ Tools chain by hand, first time running it solo end to end rather than reusing a prior box's commands, specifically for the muscle memory.

```powershell
PECmd.exe -d "C:\Windows\prefetch" --csv "Output\Prefetch" --csvf prefetch_timeline.csv
EvtxECmd.exe -d "C:\Windows\System32\winevt\logs" --csv "Output\EventLogs" --csvf tracer_eventlogs.csv
MFTECmd.exe -f 'C:\$Extend\$J' --csv "Output\USNJournal" --csvf usn_journal.csv
```

`PECmd` batch-parses every prefetch file into one CSV. `EvtxECmd` recurses the full `winevt\logs` folder and merges every channel, Security, System, Sysmon, PowerShell, and the rest, into one normalized combined CSV. `MFTECmd` parses the USN Journal (`$J`) directly; there was no companion `$MFT` in this evidence set, so full parent paths don't resolve, only filenames, timestamps, and change-reason codes, which is expected, not a failure.

One PowerShell-specific gotcha worth flagging: the `$Extend\$J` path has to be single quoted. Inside a double quoted string, `$Extend` and `$J` parse as variable references and silently resolve to empty, producing a broken path with no error explaining why.

---

## Investigation, Every Task

### Task 1, Total PsExec Executions

Filtered the prefetch CSV for `PSEXESVC`, read its **Run Count** field: **9**.

Prefetch tracks two separate things: a cumulative Run Count that keeps incrementing indefinitely, and a ring buffer of only the **last 8** run timestamps, exposed separately as a "Timeline" file. Run Count is the right source for a total; the Timeline file will disagree once execution count passes 8, since the oldest entry ages out while Run Count keeps climbing. That gap becomes directly relevant again in Task 3.

**Answer:** 9

### Task 2, Dropped Service Binary

`System.evtx`, Event ID 7045 ("A new service was installed in the system") records `Service Name: PSEXESVC`, `Service File Name: C:\Windows\PSEXESVC.exe`, corroborated by a matching `PSEXESVC.EXE-AD70946C.pf` prefetch entry.

The instinct worth correcting here: PSEXESVC installing mid-session (not at boot) and living in `C:\Windows\` (not `System32`) both looked like anomalies at first. They're not. PsExec creates PSEXESVC fresh on **every single invocation** and auto-deletes both the service and binary the moment the session ends, this is standard behavior for the tool itself, legitimate or malicious, and it always drops into `C:\Windows\`. What actually earns escalation here is volume and context, 9 separate installs on a workstation inside 17 minutes, not the install mechanics.

**Answer:** psexesvc.exe

### Task 3, Timestamp of the 5th-Last Instance

The prefetch Timeline shows exactly 8 rows, not 9, for the reason above: execution #1's timestamp already aged out of the ring buffer once execution #9 happened. Counting back from the most recent of the 8 retained rows:

| Run Time | Position |
|---|---|
| 12:10:03 | 1st last |
| 12:09:09 | 2nd last |
| 12:08:54 | 3rd last |
| 12:08:23 | 4th last |
| **12:06:54** | **5th last** |
| 11:57:53 | 6th last |
| 11:57:43 | 7th last |
| 11:55:44 | 8th last (oldest retained) |

**Answer:** 07/09/2023 12:06:54

### Task 4, Workstation Hostname

The event log `Computer` field, populated on every record from the raw event XML, returned **three different values** across this one evidence set: `DESKTOP-H72HB4B` (the overwhelming majority, background telemetry noise), `Forela-Wkstn002`, and `Forela-Wkstn001`. This box had been renamed at least twice over its lifetime, and old log entries retain whatever hostname was active when they were written, they don't retroactively update.

Picking the majority value would have been wrong. The fix: correlate the `Computer` field specifically against events falling inside the actual incident window, which resolves cleanly to `Forela-Wkstn001`.

**Answer:** Forela-Wkstn001

### Task 5 & 6, Key File and Its Creation Timestamp

PsExec drops a session-unique `PSEXEC-<hostname>-<hash>.key` file every run, visible in the USN Journal as 2 to 3 near-identical rows per file at the same timestamp, one row per change reason (`FileCreate`, `DataExtend`, `Close`), not a data quality issue.

Because the random suffix changes every invocation, matching the exact Task 3 timestamp mattered, not just grabbing the first `.key` file encountered while scrolling:

| Run Time | Key File |
|---|---|
| 12:10:03 | ...CAD5E7EF.key |
| 12:09:09 | ...89A517EE.key |
| 12:08:54 | ...415385DF.key |
| 12:08:23 | ...C3E84A44.key |
| **12:06:55** | **...95F03CFE.key** |
| 11:57:53 | ...663BCB85.key |
| 11:57:43 | ...7AA5D6C6.key |
| 11:55:44 | ...EDCC783C.key |

**Answers:** PSEXEC-FORELA-WKSTN001-95F03CFE.key, created 07/09/2023 12:06:55

### Task 7, Named Pipe Ending in "stderr"

PsExec opens three named pipes per session for stdin/stdout/stderr redirection, logged by Sysmon Event ID 17 (PipeCreated) and 18 (PipeConnected). Filtering for `stderr` returned 18 rows spanning **all 9** executions, unlike prefetch and the USN Journal, Sysmon's operational log isn't capped at 8, it only limits on overall log size.

Worth flagging honestly: the filtered grid wasn't chronologically sorted by default (it showed the 5 newer timestamps before the 4 older ones), so the correct row happened to land first purely by coincidence. The right practice regardless of outcome: force an explicit sort on the timestamp column before counting "Nth-last" anything by row position.

**Answer:** \PSEXESVC-FORELA-WKSTN001-3056-stderr

---

## The Full Story

An attacker with existing access targets `Forela-Wkstn001` for lateral movement and runs PsExec against it 9 separate times over roughly 17 minutes. Each invocation follows PsExec's unmodified standard workflow, connect via SMB to `ADMIN$`, copy itself as `PSEXESVC.exe` to `C:\Windows\`, install and start it as a temporary service, open three named pipes for command I/O, drop a session-unique key file, and on close, automatically tear the service and binary back down. That teardown is routine PsExec cleanup, not attacker anti-forensics.

The workstation's own logs carry evidence of at least two prior renames, meaning the hostname active during the incident (`Forela-Wkstn001`) isn't what the box currently reports (`DESKTOP-H72HB4B`), a detail that would derail an investigation relying on the most common value instead of timeline correlation.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| Service | PSEXESVC | Standard PsExec service name, hardcoded, dropped to C:\Windows\ every invocation |
| Named pipes | \PSEXESVC-<host>-<pid>-stdin/stdout/stderr | One triplet per session |
| Key file | PSEXEC-<host>-<8 char hex>.key | One per session, unique random suffix |
| Compromised host | Forela-Wkstn001 (rename history: -> Forela-Wkstn002 -> DESKTOP-H72HB4B) | |
| Execution volume | 9 invocations in ~17 minutes (11:53:02 to 12:10:03, 2023-09-07) | Volume/context is the real signal, not install mechanics |

---

## Key Takeaways

- **A tool's cumulative counter and its retained-history window can disagree.** Prefetch's Run Count (9) and its stored Timeline rows (8) split here because of an 8-slot ring buffer, know which field answers "how many total" versus "when did each happen."
- **Don't mistake a tool's normal operating behavior for the indicator itself.** PsExec dropping PSEXESVC fresh every session, always into `C:\Windows\`, always auto-deleted on close, is baseline for the tool. The signal here was volume and context, not the mechanics.
- **A "fixed" property like hostname can change mid-lifecycle.** Trusting the majority value across a whole log set can point at the wrong host entirely; correlate against the specific incident timeframe instead.
- **Different artifact types cap retained history differently.** Prefetch and the USN Journal both truncated at 8 of 9 executions; Sysmon's operational log held all 9.
- **Never trust an unsorted grid's row order as rank order.** Force a real chronological sort before counting "Nth-last" anything, an unsorted view can coincidentally land on the right answer and still be the wrong method to repeat.

---

## Detection Opportunities

- Alert on repeated Event ID 7045 service installs named `PSEXESVC` within a short window on any host that isn't a designated admin jump box, volume is the tell, not the single event.
- Baseline expected PsExec/remote-admin usage per host role; a workstation showing this pattern at all is worth a ticket even before counting instances.
- Correlate `PSEXESVC` named-pipe creation (Sysmon 17/18) with the corresponding service-install event to build a per-session timeline rather than treating each artifact type in isolation.
- Don't rely solely on the event log `Computer` field for host identity in an environment where renames/re-imaging happen; cross-check against a separate asset inventory when the field's history looks inconsistent.

---

## Quick Answer Reference

| # | Task | Answer |
|---|---|---|
| 1 | Total PsExec executions | 9 |
| 2 | Dropped service binary | psexesvc.exe |
| 3 | Timestamp, 5th-last instance | 07/09/2023 12:06:54 |
| 4 | Workstation hostname | Forela-Wkstn001 |
| 5 | Key file, 5th-last instance | PSEXEC-FORELA-WKSTN001-95F03CFE.key |
| 6 | Key file creation timestamp | 07/09/2023 12:06:55 |
| 7 | Named pipe ending in "stderr" | \PSEXESVC-FORELA-WKSTN001-3056-stderr |
