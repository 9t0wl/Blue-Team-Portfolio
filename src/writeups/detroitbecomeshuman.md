# HTB Sherlock: Detroit Becomes Human, Full Writeup

**Category:** DFIR / Malware Triage (Malvertising -> Fake AI Installer -> Extension Payload) | **Platform:** Hack The Box (Sherlock, CDSA Preparation Track) | **Difficulty:** Hard | **Rating:** 4.3 (24)

**Status: SOLVED**, all 16 tasks, 965 XP, solved 2026-09-25, HTB rank #447. HTB status: **Retired**, clear to publish.

---

## TL;DR

Forela sysadmin Alonzo Spire clicks a sponsored Facebook ad for a fake "Google AI Gemini Ultra" desktop tool, posted by a page with 200k+ followers. He downloads a password-protected RAR, extracts it, and runs the bundled MSI thinking he's installing an AI assistant. What actually installs is a fake browser-extension-style payload, staged inside a directory built to look like a legitimate Google product folder, launched through a batch-file dropper whose creation timestamp was deliberately backdated to blend in with pre-existing software. When Alonzo can't find the app he thought he installed, he searches for it in File Explorer, gets suspicious, contacts the security team, and deletes the archive himself, unknowingly leaving a full forensic trail across the registry, event logs, `$MFT`, and Recycle Bin.

Sixteen tasks span the entire kill chain: the malvertising click, the true identity of the installer versus what it claimed to be, a timestomped staging directory recovered entirely from resident `$MFT` data, a PowerShell dropper chain confirmed independently across two different log sources, a recovered fake-extension payload, the victim's own after-the-fact investigation, and closing the loop on the installer's MD5 hash via public sandbox intelligence when local extraction hit a password wall.

---

## Scenario

> Alonzo Spire is fascinated by AI after noticing the recent uptick in usage of AI tools to help aid in daily tasks. He came across a sponsored post on social media about an AI tool by Google. The post had a massive reach, and the Page which posted had 200k+ followers. Without any second thought, he downloaded the tool provided via the Post. But after installing it he could not find the tool on his system which raised his suspicions. A DFIR analyst was notified of a possible incident on Forela's sysadmin machine. You are tasked to help the analyst in analysis to find the true source of this odd incident.

This Sherlock is modeled on a real 2023-2024 malvertising campaign (fake "Google Bard"/ChatGPT Facebook ads spreading credential-stealing malware disguised as AI desktop tools — see Nexusguard, DFRLab, and Check Point's public writeups on the real campaign), with a custom infection chain built around it.

---

## Methodology & Tooling

Worked entirely against a KAPE-style triage bundle, no live host access. The collection was deliberately narrow, no `Program Files`, no `Windows\Installer`, no `Amcache.hve`, forcing repeated pivots to `$MFT` and the registry rather than direct file inspection.

```powershell
# Prefetch overview
PECmd.exe -d "<triage>\C\Windows\prefetch" --csv "<out>" --csvf Prefetch_Overview.csv

# Event logs, per-channel
EvtxECmd.exe -f "<triage>\...\Application.evtx" --csv "<out>" --csvf Application_Timeline.csv
EvtxECmd.exe -f "<triage>\...\Windows PowerShell.evtx" --csv "<out>" --csvf WindowsPowerShell_Classic.csv

# Full $MFT parse, then per-record deep dumps
MFTECmd.exe -f "<triage>\C\$MFT" --csv "<out>" --csvf MFT.csv
MFTECmd.exe -f "<triage>\C\$MFT" --de <EntryNumber>-<SequenceNumber>

# Recycle Bin metadata
RBCmd.exe -f "<triage>\C\$Recycle.Bin\<SID>\$I<random>" --csv "<out>" --csvf RecycleBin.csv

# Registry
# Registry Explorer against NTUSER.DAT and SOFTWARE hives

# Browser artifacts
# DB Browser for SQLite against Edge's History and Web Data (both WebKit-epoch timestamps)
```

- `MFTECmd --de <Entry>-<Sequence>` became the workhorse of this box, used both for resident-data recovery (files too small to exist outside their own MFT record) and for its byte-offset header field (`Offset: 0x...`), which directly answered a "find the hex offset of this file on the filesystem" task.
- `EvtxECmd` was run per-channel rather than pointed at the whole `winevt\logs` folder, since two *different* PowerShell logs (`Operational` and classic `Windows PowerShell`) needed separate investigation, one came up empty, the other didn't.
- `RBCmd`'s console output silently converts deletion timestamps to the analysis machine's local timezone, while its CSV output preserves true UTC, a 7-hour discrepancy caught mid-investigation (see Task 15 below).

---

## Investigation, Grouped by Phase

### Phase 1 — Initial Access (Tasks 1-4)

Edge's `History` SQLite database (`urls`/`visits` for browsing, `downloads`/`downloads_url_chains` for file downloads) gave the entry point directly: a Facebook post from page `AI.ultra.new`, visited `2024-03-19 04:30:00 UTC`, linking to a RAR archive, `AI.Gemini Ultra For PC V1.0.1.rar`.

The `downloads_url_chains` table (records every redirect hop a download URL takes) was the key to isolating the malicious download from unrelated legitimate ones in the same table (Sysinternals, GitHub blob downloads): download `id=5`'s chain started at Facebook's own `l.php` link-shim redirector and hopped through Google Drive's direct-download endpoint three times before landing, a fingerprint distinct from the other, unrelated download IDs.

### Phase 2 — The Real Installer vs. What It Claimed to Be (Tasks 5-6)

The registry `SOFTWARE` hive's `Uninstall` key for the installed package told a different story than the archive's filename: `DisplayVersion 3.32.3`, `Publisher: Google` (spoofed), and a `Comments` field reading *"Bringing the benefits of AI to everyone"*, real Google/Gemini marketing copy, reused to sell the impersonation.

Pinning the exact install-completion timestamp took three attempts across `Application.evtx`'s MsiInstaller events, a good lesson in not conflating adjacent-but-different event IDs:

| Event ID | Meaning | Result |
|---|---|---|
| 1042 | "Installer Exited" | **Wrong** — a process exiting isn't the same as installation succeeding |
| 1040 | "Installer Started" | **Wrong** — start time, not completion |
| **11707/1033** | **"Installation completed successfully"** | **Correct** — the one event ID that explicitly states success |

A text-filtered search for "Gemini" in Timeline Explorer initially hid the correct event, its message text didn't repeat the product name. Clearing the filter and scanning the raw timeline chronologically is what surfaced it.

### Phase 3 — The Staging Ground and a Timestomping Catch (Tasks 7-9)

`Program Files` didn't exist anywhere in this triage collection, forcing a pivot straight to `$MFT`, which still records metadata (including a resident copy of small file contents) for anything ever created on the volume, independent of what a targeted triage tool chose to collect.

That pivot paid off twice. First, it revealed the actual staging directory, `C:\Program Files (x86)\Google`, a path built to look exactly like where a real Google product would live. Second, comparing the two creation-timestamp attributes NTFS keeps per file exposed deliberate timestomping:

| Attribute | Meaning | Value for `install.cmd` |
|---|---|---|
| `Created0x10` (`$STANDARD_INFORMATION`) | What Explorer/`dir` shows; trivially fakeable | `2024-01-22 13:59:20` (**fake**, backdated) |
| `Created0x30` (`$FILE_NAME`) | Lives in the parent directory's index; much harder to tamper with | `2024-03-19 04:31:20` (**real**) |

The real value independently matched the MsiInstaller "Installer Exited" event timestamp from Phase 2, three-way corroboration (0x30, event log, and later the archive's own sandbox metadata) on the true creation time, versus a single fake value trying to make the file look pre-existing and legitimate.

At only 94 bytes, `install.cmd`'s entire content lives inside its own MFT record (`Resident: True` on all three of its attributes), recovered with `MFTECmd --de <Entry>-<Seq>` and no live filesystem access:

```
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0nmmhkkegccagdldgiimedpic/ru.ps1"
```

`nmmhkkegccagdldgiimedpic` is styled exactly like a Chrome extension ID (32-char, lowercase a-p only) despite no real `Extensions\` folder existing on this box, deliberate misdirection for anyone skimming the path.

### Phase 4 — Confirming Execution Across Two Different Logs (Task 10)

`Microsoft-Windows-PowerShell%4Operational.evtx` (ScriptBlock/Module logging, event IDs 4103/4104) had **nothing** for this timeframe, only unrelated entries from 2023. A realistic negative: not every environment has ScriptBlock logging enabled, and an empty expected log doesn't mean the evidence is gone.

The classic **`Windows PowerShell.evtx`** log (a different file, same provider family) still had it. Its engine-lifecycle events (600 "Provider is Started", 400 "Engine state changed to Available", 403 "...to Stopped") each carry a `Payload Data1` field with `HostApplication=<full command line>`, populated purely because a process started and stopped, independent of any script-content logging:

```
powershell -ExecutionPolicy Bypass -File C:\Program Files (x86)\Google\Install\nmmhkkegccagdldgiimedpic/ru.ps1
```

This confirmed `%~dp0` resolved exactly as expected to the staged Google directory.

### Phase 5 — Recovering the Fake Extension Payload (Tasks 11-12)

`$MFT` filtered to the staging folder revealed a classic Chrome-extension trio, `manifest.json` (714B), `background.js` (17,208B), and `content.js` (258B), confirming this was a fake browser extension, just sideloaded outside the real `Extensions\` directory rather than through it.

`content.js`, the smallest, was dumped the same way (`--de`, resident `$DATA`), and its record header (`Offset: 0x3E90C00`) directly answered a "find the hex offset of this file on the filesystem" task without needing raw disk access, MFTECmd's own reported byte offset of the record within `$MFT` was the literal answer.

```javascript
var isContentScriptExecuted = localStorage.getItem('contentScriptExecuted');
if (!isContentScriptExecuted) {
chrome.runtime.sendMessage({ action: 'executeFunction' }, function (response) {
  localStorage.setItem('contentScriptExecuted', true);
});
}
```

Just a bootstrap, checks a flag, then messages the far larger `background.js` (17KB) to run the real logic. `background.js` itself wasn't required by this Sherlock's task list and wasn't pulled.

### Phase 6 — The Victim's Own Investigation (Tasks 13-15)

Alonzo's own search for the missing tool is recorded in his `NTUSER.DAT`, at `Software\Microsoft\Windows\CurrentVersion\Explorer\WordWheelQuery` (File Explorer's search-box MRU): search term `Google Ai Gemini tool`, and the key's own **Last Write** timestamp doubles as the exact search time, `2024-03-19 04:32:11`.

His subsequent deletion of the archive is recoverable from the Recycle Bin. The SID folder held several `$I`/`$R` pairs, one (`$RV8BC8M`, a folder containing an unrelated `.theme` file dated days earlier) was a red herring; the real pair, `$I2MU60B.rar`/`$R2MU60B.rar`, matched by extension and by the original path recorded inside the `$I` metadata (`RBCmd`), and the `$R` file recovered the full 404,274-byte archive byte-for-byte.

**Timezone gotcha caught here:** `RBCmd`'s console output printed the deletion time as `2024-03-18 21:34:16`; its own CSV output for the identical record showed `2024-03-19 04:34:16`, a 7-hour difference. The console display silently converts to the analysis machine's local timezone; the CSV preserves true UTC. Trusting the console text alone would have produced a wrong answer.

### Phase 7 — Closing the Loop, MD5 of the Real Installer (Task 16)

The recovered RAR was intact but RAR5-password-protected, blocking direct extraction. Hashing the RAR itself (`A0AF1CC1265B96DE8699A4DAEAB236A7`) was rejected, correctly: an archive is a *container*, not "the installer" the task asked for. 7-Zip's own password-prompt error, however, leaked the internal filename before failing: `AI.Gemini Ultra For PC V1.0.1\Google AI Gemini Ultra For PC V1.0.1.msi`.

Rather than chasing the RAR password through local artifacts (autofill, clipboard, saved credentials), searching that distinctive filename directly surfaced a **public ANY.RUN sandbox report** for the exact sample, apparently submitted independently of this Sherlock's construction. Its Static Information tab had every hash pre-computed, and its file metadata independently corroborated the earlier timestomping finding (`Last Saved: Mon Jan 22 11:59:18 2024`, matching the faked `0x10` value exactly):

**MD5: `BF17D7F8DAC7DF58B37582CEC39E609D`**

---

## The Full Story

A malvertising campaign, a sponsored Facebook post from a page with a fabricated 200k-follower audience, lures Forela sysadmin Alonzo Spire into downloading a password-protected archive he believes contains a desktop AI assistant. The MSI inside installs successfully and completely silently, spoofing Google as its publisher and reusing real Google marketing copy to sell the impersonation, while dropping its actual payload, a fake browser-extension package, into a directory built to look like a legitimate Google product folder. A batch-file dropper launches a PowerShell script from that folder, its own creation timestamp deliberately backdated by two months to blend in as pre-existing software. When Alonzo can't find the AI tool he thought he'd installed, he searches for it, grows suspicious, reports it, and deletes the archive himself, inadvertently leaving behind every artifact needed to reconstruct the entire chain: the click, the install, the timestomp, the staged payload, and his own after-the-fact investigation.

No exploitation, no privilege escalation. Just a convincing lure, a spoofed installer, and a defender's job of stitching together registry, event logs, `$MFT`, and the Recycle Bin into one coherent timeline, closing the final gap with public threat intelligence when local evidence hit a password wall.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| Lure | `facebook.com/AI.ultra.new/posts/...` | Fake "Google AI" page, 200k+ followers |
| Delivery archive | `AI.Gemini Ultra For PC V1.0.1.rar` | Password-protected, RAR5, 404,274 bytes |
| Malicious installer | `Google AI Gemini Ultra For PC V1.0.1.msi` | MD5 `BF17D7F8DAC7DF58B37582CEC39E609D`, spoofed Publisher "Google", DisplayVersion 3.32.3 |
| Staging directory | `C:\Program Files (x86)\Google\Install\` | Legitimate-looking vendor path abused for staging |
| Dropper | `install.cmd` | Timestomped (`0x10` faked to 2024-01-22, real `0x30`/event-log time 2024-03-19 04:31:20/33) |
| Second-stage script | `nmmhkkegccagdldgiimedpic\ru.ps1` | Folder name styled as a fake Chrome extension ID |
| Fake extension payload | `manifest.json`, `background.js`, `content.js` | Chrome-extension-style trio staged outside the real Extensions directory |

---

## Key Takeaways

- **A targeted triage collection is deliberately incomplete.** No `Program Files`, no `Windows\Installer`, no `Amcache.hve` here, none of that means the evidence is gone; it means the right artifact is `$MFT`, which records metadata (and, for small files, full content) for the whole volume regardless of what else got collected.
- **Two NTFS creation timestamps exist for a reason.** `$STANDARD_INFORMATION` (0x10) is what most tools show and what's trivial to fake; `$FILE_NAME` (0x30) is far harder to tamper with. A mismatch between them, especially one independently corroborated by an event log or third-party metadata, is a reliable timestomping signal.
- **Not every "process ended" event means "operation succeeded."** MsiInstaller alone had three relevant event IDs (Started, Exited, Completed Successfully); only one of them actually answers "when did this install finish."
- **One log coming up empty doesn't mean the evidence doesn't exist elsewhere.** ScriptBlock logging wasn't enabled here, but the classic PowerShell log's engine-lifecycle events captured the full command line anyway, through a completely different logging mechanism tied to process start/stop rather than script content.
- **A tool's console output and its file output can silently disagree.** `RBCmd`'s console text converted a UTC timestamp to local time without saying so; its CSV kept the correct UTC value. Always verify a timestamp against the structured output, not a tool's human-readable console print.
- **When local extraction is blocked but a filename is distinctive, search it before brute-forcing the blocker.** A password-protected archive didn't need its password recovered at all, once the internal filename leaked via a tool's own error message, a plain search surfaced a public sandbox report with every hash already computed.

---

## Detection Opportunities

- Alert on MSI installations where the registered `Publisher` field doesn't match a code-signing certificate, or where `DisplayName` is generically vague (e.g. "Install") rather than product-specific.
- Flag newly-created files under vendor-branded paths (`Program Files\<KnownVendor>\...`) whose `$STANDARD_INFORMATION` and `$FILE_NAME` creation timestamps disagree, a cheap, broadly-applicable timestomping detection that doesn't require behavioral analysis.
- Monitor for `powershell.exe` invocations with `-ExecutionPolicy Bypass` launched from a `.cmd`/`.bat` file via `%~dp0`-relative paths, a common living-off-the-land dropper pattern.
- Watch for directories under legitimate vendor paths containing folder names styled like browser extension IDs (32-char, lowercase a-p) outside the actual browser profile's `Extensions\` directory, a low-cost heuristic for this specific misdirection technique.
- Ensure PowerShell ScriptBlock logging (4104) is actually enabled fleet-wide; this box's Operational log gap is a realistic and common environment misconfiguration that blinds the richest available PowerShell telemetry.

---

## Quick Answer Reference

| # | Task | Answer |
|---|---|---|
| 1 | Facebook post URL | `facebook.com/AI.ultra.new/posts/pfbid0BqpxXypMtY5dWGy2GDfpRD4cQRppdNEC9SSa72FmPVKqik9iWNa2mRkpx9xziAS1I` |
| 2 | UTC visit timestamp | `2024-03-19 04:30:00` |
| 3 | Downloaded archive filename | `AI.Gemini Ultra For PC V1.0.1.rar` |
| 4 | Direct download URL | `https://drive.usercontent.google.com/download?id=1z-SGnYJCPE0HA_Faz6N7mD5qf0E-A76H&export=download` |
| 5 | True installed product version | `3.32.3` |
| 6 | Install completion timestamp | `2024-03-19 04:31:33` |
| 7 | Legitimate staging directory | `C:\Program Files (x86)\Google` |
| 8 | File that executed a command | `install.cmd` |
| 9 | install.cmd contents (whitespace stripped) | `@echooffpowershell-ExecutionPolicyBypass-File"%~dp0nmmhkkegccagdldgiimedpic/ru.ps1"` |
| 10 | Logged command line | `powershell -ExecutionPolicy Bypass -File C:\Program Files (x86)\Google\Install\nmmhkkegccagdldgiimedpic/ru.ps1` |
| 11 | Hex offset of the small .js file | `3E90C00` |
| 12 | content.js contents (whitespace stripped) | `varisContentScriptExecuted=localStorage.getItem('contentScriptExecuted');if(!isContentScriptExecuted){chrome.runtime.sendMessage({action:'executeFunction'},function(response){localStorage.setItem('contentScriptExecuted',true);});}` |
| 13 | File Explorer search keywords | `Google Ai Gemini tool` |
| 14 | Search timestamp | `2024-03-19 04:32:11` |
| 15 | Archive deletion timestamp | `2024-03-19 04:34:16` |
| 16 | MD5 of the malicious installer | `BF17D7F8DAC7DF58B37582CEC39E609D` |

---

## Cheat Sheet Updates Made

Added new cards to `Documents\cyber\blue-team-cheatsheet\src\data\file-db-artifact-recovery.js`: the `MFTECmd --de` workflow as a tool-assisted alternative to manual byte-offset `$MFT` reads (including its `Offset:` header field for hex-offset-style tasks), 0x10-vs-0x30 timestomping detection, the RBCmd console-vs-CSV timezone gotcha, and the "search a distinctive leaked filename against public sandboxes before brute-forcing a local blocker" technique.
