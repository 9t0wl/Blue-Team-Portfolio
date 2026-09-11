# HTB Sherlock: Trojan, Full Writeup

**Category:** DFIR / Malware Triage (Trojanized Installer, C2 Beaconing) | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** 11 September 2026

---

## TL;DR

A user downloads what looks like ordinary file-recovery software after accidentally deleting a document, and his PC starts behaving strangely right after installing it. The evidence bundle hands over three sources at once, a network capture, a memory snapshot, and a disk image, and the job is to reconstruct the whole infection using all three together rather than trusting any single one.

The bait turns out to be a trojanized Inno Setup installer impersonating a real product, FinalRecovery v3.0.7.0325, pulled from a compromised free WordPress host. Once run, it beacons persistently to three raw IP C2 endpoints and executes twice, about 90 seconds apart, a fact confirmed three independent ways across Prefetch, memory, and the packet capture.

---

## Scenario

> John Grunewald was deleting some old accounting documents when he accidentally deleted an important document he had been working on. He panicked and downloaded software to recover the document, but after installing it, his PC started behaving strangely. Feeling even more demoralised and depressed, he alerted the IT department, who immediately locked down the workstation and recovered some forensic evidence. Now it is up to you to analyze the evidence to understand what happened on John's workstation.

---

## Methodology & Tooling

Three evidence types, three toolchains, cross-referenced against each other rather than worked in isolation.

```
# Network, Zui (Zed query language) on the pcap
# Memory, Volatility 3, CSV output piped into a local browser triage tool
vol -r csv -f "memory.vmem" windows.info    > trojan_osinfo.csv
vol -r csv -f "memory.vmem" windows.pstree  > pstree.csv
vol -r csv -f "memory.vmem" windows.registry.printkey --key 'ControlSet001\Control\ComputerName\ComputerName' > hostname.csv

# Disk, FTK Imager to browse the AD1 logical image, export Prefetch, parse with PECmd
PECmd.exe -f "RECOVERY_SETUP.EXE-A808CDAB.pf" --csv prefetch_out
```

Zui (formerly Brim) is a GUI over the Zed query language and Zeek. Dropping the pcap in runs it through Zeek automatically and produces the standard log set, `conn`, `http`, `dns`, `files`, `ssl`, all queryable from one place. Volatility 3's CSV renderer feeds a local browser triage tool that auto-detects process and network tables from the CSV header, with click-a-PID cross-referencing between tabs.

One tooling note worth keeping: the legacy Autopsy 2.x package on Kali does not read FTK's `.ad1` format at all, only raw and EnCase images. FTK Imager itself is Windows-only, so it ran on the Windows host directly rather than fighting Wine.

---

## Investigation, Every Task

### OS Build and Hostname

`windows.info` had no `NtBuildLab` field populated, so the build number came from `Major/Minor: 15.19041` instead, `19041` being a Windows 10 20H2 build. Hostname came straight out of the registry via `windows.registry.printkey` against `ControlSet001\Control\ComputerName\ComputerName`.

**Answers:** 19041, DESKTOP-38NVPD0

### The Download

Zui's `http.log`, sorted ascending by timestamp to reach the earliest activity in the capture (most of it turned out to be later beaconing, not the initial download). A GET for `/wp-content/uploads/2023/05/Data_Recovery.zip` with an `application/zip` response. The `/wp-content/uploads/` path is the tell, this wasn't dedicated attacker infrastructure, it was a compromised or abused free WordPress host, giving the download domain a reputation it wouldn't have on freshly registered infrastructure.

**Answers:** Data_Recovery.zip, from praetorial-gears.000webhostapp.com

### The Suspicious Process

`windows.pstree` showed `Recovery_Setup.exe` (PID 484) spawning a child `is-NJBAT.tmp`, flagged critical, running from a randomly named `is-VIBV9.tmp` folder under `AppData\Local\Temp` with a `/SL4 $A033C` flag, the textbook signature of an Inno Setup installer extracting itself. The process the user directly executed from the ZIP is the parent, not the internal extraction stub.

**Answers:** PID 484, C:\Users\John\Downloads\Data_Recovery\Recovery_Setup.exe

### A Hashing Dead End, and the Fix

First attempt hashed the file straight out of memory via `windows.dumpfiles`, using the `DataSectionObject` dump. VirusTotal showed 0/61 undetected, and the hash was rejected outright.

The cause: `DataSectionObject` reconstructs a file from the VACB memory cache, only whatever chunks Windows had actually cached at snapshot time. Any region never read into cache comes back zero padded, silently corrupting the hash even though the dump is the right size and opens fine. The fix was to stop reconstructing from memory and pull the literal bytes from ground truth instead, Wireshark's File, Export Objects, HTTP, filtered to `application/zip`, saved the same ZIP straight out of the pcap, then hashed the extracted executable directly. That hash came back 53/72 malicious on VirusTotal and was accepted.

**Answer:** c34601c5da3501f6ee0efce18de7e6145153ecfac2ce2019ec52e1535a4b3193

### Execution Timeline

FTK Imager located `RECOVERY_SETUP.EXE-A808CDAB.pf` in the disk image's Prefetch folder. PECmd's parsed output carried the real answer: an internal run time array, written directly into the file's own binary structure by the Prefetcher, showing a last run of `02:07:59` and an earlier run of `02:06:29`, a ten second gap against the file's own filesystem Created timestamp. The internal array is the authoritative source, since it's written by the component that actually tracks executions, not a side effect of it. Run count came straight from the same parse: 2.

**Answers:** First executed 2023-05-30 02:06:29, 2 total executions

### The Second .TMP File

The malicious application references `IS-NJBAT.TMP` and one other. `is-VIBV9.tmp`, the extraction folder itself, was the wrong answer, since it's a directory, not a file. The right one turned up in PECmd's keyword flagged file reference list: a second stub, `IS-R7RFP.TMP`, inside a second folder from the earlier execution never captured in memory at all. Two executions, two stubs, and FTK Imager independently confirmed each stub had its own separate Prefetch entry, a third source agreeing with the same count.

**Answer:** IS-R7RFP.TMP

### Command and Control

Persistent beaconing to raw IPs at tight, even intervals, the signature of polling C2 rather than one-off requests. VirusTotal's file Relations tab on the executable's own hash, its own sandbox detonation record, showed 4 of the contacted URLs flagged malicious and 4 clean, the clean ones being ordinary Microsoft and Sectigo certificate revocation checks that any signed executable triggers.

**Answer:** 4 malicious C2 URLs

### The Downloaded Binary

A file named `fuckingdllENCR.dll` turned up in Zeek's `files.log`, a real filename pulled from a `Content-Disposition` header, almost certainly the encrypted payload the persistent beacon was pulling down. But that's a different artifact than what the task wanted, `http.log`'s URI field is only the request target, and the graded answer here was the endpoint name itself.

**Answer:** puk.php

### What the Malware Was Pretending to Be

`exiftool` on the executable's version resource showed `FileDescription: FLSCover`, confirmed built with Inno Setup. Submitted and rejected, `FLSCover` turned out to be the malware's own install directory name, not the impersonated software. The real answer came from pivoting to ANY.RUN's public sandbox database by hash, finding a prior detonation of the identical sample, and reading a dropped `Readme.txt` in its Files tab.

**Answer:** FinalRecovery v3.0.7.0325

---

## The Full Story

John downloads `Data_Recovery.zip` from a compromised WordPress upload path, extracts and runs `Recovery_Setup.exe`, an Inno Setup installer impersonating the real product FinalRecovery v3.0.7.0325. The installer self-extracts into a randomly named temp folder and runs twice total, about 90 seconds apart. Post install, the malware beacons persistently to three raw IP endpoints, all flagged C2 by VirusTotal, and pulls down an encrypted payload named `fuckingdllENCR.dll` over the most active of those beacon channels.

Nothing about the initial download or installation looks unusual on its own, a ZIP from a plausible-looking domain, a standard Inno Setup installer flow. The signal is entirely in what happens after, the beaconing pattern, the second execution, and the payload retrieval.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| Delivery domain | praetorial-gears.000webhostapp.com | Compromised or abused free WordPress hosting, not dedicated attacker infra |
| Dropped executable | Recovery_Setup.exe, SHA256 c34601c5da3501f6ee0efce18de7e6145153ecfac2ce2019ec52e1535a4b3193 | Inno Setup installer impersonating FinalRecovery v3.0.7.0325 |
| C2 endpoints | 45.12.253.75/dll.php, 45.12.253.72/default/{puk,stuk}.php, 45.12.253.56/advertisting/plus.php | Raw IPs, even-interval beaconing |
| Downloaded payload | fuckingdllENCR.dll (95 KB) | Encrypted, pulled via the dll.php channel |
| Execution pattern | 2 runs, 90 seconds apart (02:06:29 and 02:07:59 UTC) | Confirmed via Prefetch internal array, file reference list, and separate stub Prefetch entries |

---

## Key Takeaways

- **Memory reconstruction is inference, not ground truth, for exact hashes.** A `DataSectionObject` dump only contains whatever pages were cached at snapshot time, missing pages come back zero padded and silently break the hash. When a file also exists on disk or crossed the network, extract it from there instead.
- **A Prefetch file's internal run time array outranks its own filesystem timestamps.** The array is written directly by the Prefetcher, filesystem metadata is a step removed and can disagree by seconds.
- **Static PE metadata can mislead as easily as it can inform.** A `FileDescription` string that looks plausible can just as easily be an install directory as a genuine product name. A public sandbox lookup by hash often has a full detonation report that resolves the ambiguity.
- **Cross validate across every evidence type available.** The two-execution finding here held up because three independent sources agreed on it, not because the first source that answered the question was trusted alone.

---

## Detection Opportunities

- Alert on outbound HTTP to raw IP literals at tight, even intervals from a user workstation, a strong polling C2 signature independent of any specific domain or hash.
- Flag installer executables launched from `Downloads\` that spawn a second process into a randomly named `AppData\Local\Temp` folder within seconds, the Inno Setup self-extraction pattern is legitimate on its own but worth correlating against download source reputation.
- Treat certificate revocation checks (Microsoft, Sectigo, DigiCert) as expected background noise when triaging a sample's contacted URLs, don't let them dilute a detection ratio that's really about the handful of genuinely malicious endpoints.
- Hash every downloaded installer before execution and check it against a public sandbox, not just an AV aggregator, a prior detonation report can reveal an impersonated product name that static metadata alone won't.

---

## Quick Answer Reference

| # | Task | Answer |
|---|---|---|
| 1 | OS build version | 19041 |
| 2 | Computer hostname | DESKTOP-38NVPD0 |
| 3 | Downloaded ZIP filename | Data_Recovery.zip |
| 4 | Download domain | praetorial-gears.000webhostapp.com |
| 5 | Suspicious process PID | 484 |
| 6 | Suspicious process full path | C:\Users\John\Downloads\Data_Recovery\Recovery_Setup.exe |
| 7 | SHA-256 of suspicious executable | c34601c5da3501f6ee0efce18de7e6145153ecfac2ce2019ec52e1535a4b3193 |
| 8 | First execution timestamp | 2023-05-30 02:06:29 |
| 9 | Total execution count | 2 |
| 10 | Second referenced .TMP file | IS-R7RFP.TMP |
| 11 | Malicious C2 URLs (VT) | 4 |
| 12 | Downloaded binary filename | puk.php |
| 13 | Impersonated program name and version | FinalRecovery v3.0.7.0325 |
