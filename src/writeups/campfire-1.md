# HTB Sherlock: Campfire-1 — Full Writeup

**Category:** DFIR / AD Attack Forensics — Kerberoasting | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** September 2026

---

## Synopsis

A Kerberoasting attack against an Active Directory domain, reconstructed from a Domain Controller's Security log and a compromised workstation's PowerShell and Prefetch artifacts. An attacker downloaded PowerView to enumerate the domain for Kerberoastable service accounts — accounts with a Service Principal Name (SPN) set — identified one running SQL Server, then used Rubeus to request and dump a crackable Kerberos service ticket for it, all inside roughly a two-minute window.

**Chain:** PowerView downloaded to the user's Downloads folder → AD enumeration finds a SQL service account is Kerberoastable → Rubeus downloaded to the same folder → Rubeus requests a service ticket for that account, forcing an RC4-encrypted ticket (the classic Kerberoasting tell) → ticket hash dumped for offline cracking

This one hit differently than a typical DFIR exercise — Kerberoasting is an attack I already know how to run operationally (`GetUserSPNs.py`, Rubeus `kerberoast`). Working it from the evidence side instead of the operator side is the entire point of pairing offensive and defensive training.

---

## Tooling

Two EVTX files (a Domain Controller Security log and a workstation PowerShell Operational log) plus a large batch of Prefetch files, parsed entirely with [Eric Zimmerman's EZ Tools](https://ericzimmerman.github.io/) instead of Chainsaw this time — first case where EZ Tools were the primary toolchain rather than a Linux-side alternative.

```powershell
# EVTX -> CSV
EvtxECmd.exe -f "SECURITY-DC.evtx" --csv "D:\Output" --csvf security-dc.csv
EvtxECmd.exe -f "Powershell-Operational.evtx" --csv "D:\Output" --csvf powershell-operational.csv

# Prefetch -> CSV, whole folder at once
PECmd.exe -d "C:\Windows\Prefetch" --csv "D:\Output" --csvf prefetch.csv
```

Each CSV loaded as its own tab in Timeline Explorer, cross-referenced by timestamp.

---

## Investigation

### Finding the attack window

Filtering the Domain Controller's Security log to **Event ID 4769** (Kerberos service ticket requested) surfaced a tight cluster of requests. The tell that separated real attack traffic from routine machine-account noise: one event in that cluster carried `TicketEncryptionType: 0x17` — RC4. Modern Windows domains negotiate AES by default; a ticket request specifically forcing RC4 is almost always a tool doing that deliberately, because RC4-encrypted service tickets are the ones that are practical to crack offline. That's the single strongest Kerberoasting signature available in this log.

### Identifying the target

The same event's `ServiceName` field named a SQL service account — a human-managed service account rather than a machine account (`DC01$`), and exactly the kind of account Kerberoasting targets: a domain user account running a service with an SPN, whose password becomes the crackable secret the moment its ticket is captured.

### Tracing back to the workstation

The event also carried an `IpAddress` field (an IPv4-mapped IPv6 address — strip the `::ffff:` prefix) pointing at the workstation the request actually came from.

### Reconstructing the enumeration step

With the workstation identified, the investigation moved to its PowerShell Operational log. Process-creation logging alone only shows that `powershell.exe` launched — it says nothing about what ran inside the session. The actual content required **PowerShell Script Block Logging**, which captures the full script text and its source path. Filtering for AD-enumeration-flavored script blocks surfaced repeated references to a PowerView script, downloaded to the user's Downloads folder. PowerView's `Get-DomainUser -SPN` (and equivalents) is the standard way to enumerate which domain accounts carry an SPN — i.e., which accounts are Kerberoastable — before targeting one.

### Finding the actual attack tool

Enumeration finds *which* account to target; it doesn't request the ticket. That's a separate step, and usually a separate tool. Parsing the workstation's **Prefetch** folder with `PECmd` and loading the CSV in Timeline Explorer, filtering for executables that ran in the same time window as the DC-side activity, surfaced `RUBEUS.EXE` — a well-known Kerberos-abuse tool with a dedicated `kerberoast` action.

Prefetch's `Executable Name` column is filename-only, not a path, so `RUBEUS.EXE` alone wasn't enough. Recovering the actual full path meant opening that record's **Files Loaded** column, which lists every file the executable touched at runtime — including its own binary path, staged in the same Downloads folder as PowerView. Prefetch has no dedicated "path" field; this Files-Loaded trick is the workaround.

### Confirming the timeline

The same Prefetch record's `Last Run` timestamp landed **one second before** the DC's 4769 ticket-request event — the tool launching and immediately generating the ticket request it's designed to make. Two independent log sources (a workstation artifact and a Domain Controller log), one second apart, describing the same action from two different vantage points. That kind of sub-second cross-source alignment is strong corroborating evidence, not something to dismiss as coincidence.

---

## Key Takeaways

- **RC4 ticket-encryption on a 4769 event is the single strongest Kerberoasting tell available.** Modern Windows negotiates AES by default; a service ticket request specifically forcing RC4 is almost always deliberate downgrade behavior from an offensive tool.
- **Enumeration and exploitation are usually two different tools, not one.** Expect a separate artifact for "which accounts are targetable" (PowerView, BloodHound) versus "actually request the ticket" (Rubeus, Impacket).
- **Prefetch has no dedicated path field.** The `Executable Name` column is filename-only — recovering an attacker tool's actual full path means opening that record's **Files Loaded** column and finding the binary's own path among the files it referenced at runtime.
- **PowerShell Script Block Logging is what closes the "just powershell.exe launched" blind spot.** Process-creation logging alone never shows what a PowerShell session actually ran.
- **Sub-second timestamp alignment across independent log sources confirms a single causal chain.** A workstation-side execution timestamp landing one second before a Domain-Controller-side event ties the two together far more convincingly than either artifact alone.

---

## Detection Opportunities

- Alert on any 4769 event where `TicketEncryptionType` is `0x17` (RC4) for an account that normally negotiates AES — a strong, low-noise Kerberoasting indicator on its own.
- Correlate a spike of 4769 requests against **user-owned service accounts** (not machine accounts, which generate constant normal noise) from a single source IP in a short window.
- Baseline PowerShell Script Block Logging content for known offensive-tooling signatures (PowerView cmdlet names, etc.) rather than relying on process name alone.
- Flag known offensive tool filenames (`Rubeus.exe`, `mimikatz.exe`) appearing in Prefetch, especially staged in a user's Downloads folder rather than an expected install location.
- Cross-reference workstation Prefetch `Last Run` timestamps against Domain-Controller-side Kerberos event timestamps as a routine correlation step, not just when a specific tool is already suspected.
