# HTB Sherlock: Jinkies, Full Writeup

**Category:** DFIR / Endpoint Forensics (Insider Data Theft) | **Platform:** Hack The Box (Sherlock, CDSA Preparation Track) | **Difficulty:** Medium | **Solved:** 13 September 2026

---

## TL;DR

A third-party IR consultant is handed a KAPE triage bundle and one claim from a small startup: their intellectual property has leaked, and a user thinks she may have accidentally shared her Documents folder. No live host access, no prior investigation to lean on, just a single evidence bundle and a date to work from.

The chain turns out to be almost entirely mundane, an open SMB share exposing a years-old test database with one real password mixed into 216 fake ones, reused straight onto the victim's actual Windows account. No exploit chain, no privilege escalation, just credential reuse and an open share doing all the work. The interesting part is how much of the story still had to be pieced together after the attacker deliberately erased the one artifact that would have made this easy.

---

## Scenario

> You're a third-party IR consultant and your manager has just forwarded you a case from a small-sized startup named cloud-guru-management ltd. They're currently building out a product with their team of developers, but the CEO has received word of mouth communications that their Intellectual Property has been stolen and is in use elsewhere.
>
> The user in question says she may have accidentally shared her Documents folder and they have stated they think the attack happened on the 6th of October. The user also states she was away from her computer on this day.
>
> There is not a great deal more information from the company besides this. An investigation was initiated into the root cause of this potential theft from Cloud-guru; however, the team has failed to discover the cause of the leak. They have gathered some preliminary evidence for you to go via a KAPE triage. It's up to you to discover the story of how this all came to be.
>
> **Warning: This Sherlock requires an element of OSINT and players will need to interact with 3rd party services on the internet.**

---

## Methodology & Tooling

Worked this one across two environments deliberately, Linux for raw byte-level analysis, Windows/EZ Tools for anything native to the artifact types actually in the bundle, rather than forcing everything through one OS.

```bash
# registry share enumeration (UTF-16LE, since registry values are stored that way)
strings -el Windows/system32/config/SYSTEM | grep -i "^Path="

# InnoDB tablespace credential harvest
strings "bk_db.ibd" | grep -oE "[a-zA-Z0-9_.+-]+@gmail\.com"

# offline SAM/SYSTEM hash dump, no live target
secretsdump.py -sam SAM -system SYSTEM LOCAL
hashcat -m 1000 -a 0 <NT-hash> candidates.txt
```

```powershell
EvtxECmd.exe -f "Security.evtx" --csv "out" --csvf security.csv
LECmd.exe -d "AppData\Roaming\Microsoft\Windows\Recent" --csv "out" --csvf lnk_output.csv
SQLECmd.exe -f "Chrome\User Data\Default\History" --csv "out"
```

`EvtxECmd` and `LECmd` and `SQLECmd` all follow the same EZ Tools pattern, point them at an artifact, get back a clean CSV with built-in schema-aware parsing (SQLECmd in particular ships with dozens of pre-built "maps" for known SQLite schemas like Chromium's History DB, so it handles the WebKit-epoch timestamp conversion automatically instead of you writing that by hand).

---

## Investigation, Every Task

### Shared Folders

`LanmanServer\Shares` in the SYSTEM hive stores each configured share as a REG_MULTI_SZ blob, one `Path=` line per share. Two turned up, no hidden admin shares, no duplicates: `C:\Users` and `C:\Users\Velma\Documents`.

Submitting them in discovery order got rejected. Reversing the order (more specific path first) was accepted. Worth remembering for any comma-separated answer, order can matter even when a prompt doesn't say so.

### The Leaked File and Its Contents

Sitting inside the exposed share was a years-old NetBeans "logon website" test project, and inside that, a MySQL InnoDB tablespace file, `bk_db.ibd`, seeded with fake credentials for testing a login form. One of those 216 records wasn't fake.

Counting rows in an `.ibd` file by grepping `strings` output turns out to be unreliable in both directions at once. A narrow pattern match undercounts because some records get fragmented across InnoDB page boundaries and stop matching cleanly. A raw line count overcounts because of repeated structural noise, page-boundary marker pseudo-records (`infimum`/`supremum`) and B-tree page-directory key duplicates that aren't real rows. Getting an authoritative number meant parsing the actual page headers: InnoDB pages are (almost always) a fixed 16KB, byte offset 54 in each page's header holds the record count for that page, and byte offset 64 tells you whether it's a leaf page (real rows) or an internal/root page (just navigation pointers to child pages, not data). This file was 6 pages total, one root page with 2 pointer-entries and two leaf pages with 108 real records each, 216 total, matching HTB's own official solve method of counting deduplicated lines across the *complete* string output.

### Credential Cracking and Reuse Confirmation

An offline `secretsdump.py` run against the recovered SAM and SYSTEM hives (no live target needed) produced the victim's NT hash. Rather than a wordlist attack, the fastest path was testing the exact candidate strings extracted from the `.ibd` file directly against that hash with `hashcat -m 1000`, cracked instantly, confirming the full password (special characters included, no ambiguity left over from where the DB field boundary actually was) was reused verbatim from the throwaway test database onto the victim's real Windows account.

### Reconstructing the Intrusion Timeline

Filtering Security.evtx event ID 4624 for the victim's username by "contains" instead of exact match pulled in a wall of irrelevant noise, the host's own machine account (`HOSTNAME$`) happened to literally contain the victim's username as a substring, and machine accounts generate routine Type 5 (Service) logons at every boot that have nothing to do with the actual investigation.

Once filtered properly, two logon events one second apart told the real story: a `LogonType 2` followed immediately by a `LogonType 10` for the same account. This is the signature of an RDP connection with Network Level Authentication enabled, Windows logs the pre-auth handshake locally as Type 2 (loopback remote host, since LSASS processes it before the network session fully exists) and only the subsequent Type 10 carries the actual client-side source IP. Missing that pattern would mean either mistaking the Type 2 event for local console access, or missing the real originating IP entirely by stopping at the first event found.

From there: a basic recon command, a file opened in VS Code from a separate, previously-unseen folder on the Desktop, then a browsing trail through the project's own GitHub references and Sysmon documentation (checking what logging might catch them), ending at a public paste service.

### The Erased Trail, and What Survived Anyway

The browser history showed a search for the paste site, a bare visit to its homepage, and then, immediately after, a search for whether Incognito mode hides browsing history. No specific paste page ever appears in the History database after that. The natural read, and the one confirmed by both direct OSINT (public search engines don't index that paste service's unlisted pastes by default) and HTB's own official write-up, is that the actual exfiltration happened in an Incognito window specifically to avoid leaving this exact trail. That content is genuinely gone.

What wasn't gone was a small text file the attacker left behind as a parting shot. It was referenced by a `.lnk` shortcut in Recent, but the file itself was never separately collected, KAPE targets specific forensic artifact types, not arbitrary user files. The way around that: NTFS stores very small files (roughly under a kilobyte, depending on overhead) as a resident attribute directly inside their own MFT record rather than on separate disk clusters. Since `$MFT` gets collected wholesale as a core artifact regardless, the file's content survived even though the file itself never did. MFT records are (almost always) a fixed 1024 bytes each, so a direct byte-offset read against the raw `$MFT` (entry number times record size) recovered the full content without needing a dedicated hex editor, a taunt aimed at whoever eventually investigated, signed with the attacker's own handle.

---

## The Full Story

Somewhere along the line, the victim's Documents folder ends up shared over SMB. Sitting inside it, forgotten, is a years-old test project with a database of fake seeded credentials, plus her own real login, reused from that throwaway project onto her actual account. An attacker finds the open share, pulls the database, extracts her real password directly from the readable data inside it, and RDPs in as her. From there it's recon, browsing the exposed project's own code and documentation, a quiet check of what logging might be watching, and an exfiltration attempt via a public paste service, deliberately routed through an Incognito window specifically to avoid leaving the exact evidence trail that would otherwise close this case cleanly. A parting message, mocking the eventual investigator and signed with a handle, is the one piece of bravado that gives away more than the attacker probably intended.

No exploit chain anywhere in this. Just an open share, a dead test project nobody deleted, and password reuse doing all the actual work.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| Exposed share | `C:\Users\Velma\Documents` | Root cause of the leak; SMB share misconfiguration |
| Credential source | `bk_db.ibd` (InnoDB tablespace, "logon website" test project) | 216 seeded credentials, one real, reused onto victim's Windows account |
| Logon pattern | `LogonType 2` immediately followed by `LogonType 10`, same account, ~1 second apart | Signature of RDP with NLA enabled; Type 10 carries the real source IP |
| Exfiltration vector | Public paste service, visited via Incognito | Content unrecoverable from disk artifacts by design |
| Attacker artifact | Small taunt file, NTFS-resident in `$MFT`, never separately collected by KAPE | Recovered via direct byte-offset read against the raw MFT |

---

## Key Takeaways

- **A tool's own on-disk structure is often the authoritative source, not text extracted from it.** Raw `strings` output on a structured binary (a registry hive, a database tablespace) can be simultaneously wrong in both directions, undercounting from fragmentation and overcounting from structural noise. Parsing the actual page/record headers resolves the ambiguity.
- **A machine account can accidentally satisfy a "contains" filter on a username.** If a hostname happens to include the username as a substring, its machine account will too, watch for a sudden wall of Type 5 Service noise as the tell, and switch to exact match.
- **RDP with NLA logs two separate events for one connection.** The first (Type 2, loopback) is local pre-authentication; the second (Type 10, real source IP) is the actual session. Stopping at the first one either misreads it as console access or loses the real attacker IP entirely.
- **Password reuse from an abandoned dev/test resource remains one of the most boring, most common root causes there is.** No exploit chain required, just an old project nobody remembered to delete.
- **Targeted forensic collection (KAPE, or any triage tool) only grabs designated artifact types, not everything on disk.** When a shortcut or reference points at something that wasn't separately collected, check whether it's small enough to be resident inside the filesystem's own metadata structures before writing it off as unrecoverable.
- **Recognizing a genuine dead end is itself a correct conclusion.** The paste content was gone by design (unlisted, Incognito), confirmed independently through direct OSINT rather than assumed. Continuing to force a local-artifact answer that doesn't exist would have been the wrong instinct.

---

## Detection Opportunities

- Alert on SMB share creation/modification events on user workstations outside of IT-managed change windows, an accidentally-shared personal folder is exactly the kind of low-noise misconfiguration that won't trip most detections until it's already been abused.
- Flag credential material (connection strings, seeded test databases, hardcoded logins) discoverable from any world-readable or accidentally-shared path, regardless of whether it looks "just for testing."
- Correlate `LogonType 2` and `LogonType 10` event pairs sharing a timestamp and account as a normal RDP+NLA pattern, but treat a `LogonType 10` with a source IP outside expected ranges immediately following one of these pairs as the actual point of interest.
- Where feasible, log browser history at the proxy/network level rather than relying solely on local browser artifacts, since Incognito/Private browsing modes are trivial for even unsophisticated attackers to use specifically to defeat local-only browser forensics.

---

## Quick Answer Reference

| # | Task | Answer |
|---|---|---|
| 1 | Shared folders | `C:\Users\Velma\Documents, C:\Users` |
| 2 | File that gave attacker access | `bk_db.ibd` |
| 3 | Credential count in file | 216 |
| 4 | NT hash | `967452709ae89eaeef4e2c951c3882ce` |
| 5 | Password reuse (computer vs. ibd) | Yes |
| 6 | First interactive logon | `2023-10-06 17:17:23` |
| 7 | First attacker command | `whoami` |
| 8 | VSCode file before browser | `Version-1.0.1 - TERMINAL LOGIN.py` |
| 9 | Exfiltration domain | `pastes.io` |
| 10 | Attacker's handle | `pwnmaster12` |
