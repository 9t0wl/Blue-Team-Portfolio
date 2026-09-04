# HTB Sherlock: Baggage

**Category:** DFIR / Registry Forensics | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Very Easy | **Solved:** September 2026

---

## Writeup embargoed — Sherlock is currently active

This Sherlock is **still active on Hack The Box**, so a full walkthrough isn't published here. HTB's terms prohibit releasing solutions for live content, and that restriction exists for good reason: published answers devalue the exercise for everyone still working it.

**The full writeup goes up as soon as Baggage retires.**

---

## What this case covered

Without spoiling the solution path, here's the shape of the work and the skills it exercised:

**Artifact:** Windows **Shellbags** — the registry structures under `BagMRU`/`Bags` in `UsrClass.dat` and `NTUSER.DAT` that record which folders a user browsed in Explorer. Their forensic value is that they persist after the fact: a folder can be deleted, a USB stick unplugged, a network share disconnected, or an archive closed, and the record of the user having opened it survives.

Critically, shellbags don't store paths. Each numbered `BagMRU` node holds a single binary **shell item** — the same structure format used inside `.lnk` files — naming one path segment, with the hierarchy encoded in the key tree itself. Reconstructing a full path means walking that tree and reassembling segments in order.

**Evidence:** a KAPE targeted collection containing the registry hives and transaction logs for multiple user profiles.

**Techniques exercised:**

- Parsing registry hives with **RegRipper** and interpreting the `shellbags` plugin output
- Distinguishing **MRU time** (BagMRU key LastWrite — when Explorer browsed the folder) from the shell item's own embedded Modified/Accessed/Created filesystem timestamps. Nearly every question hinged on this distinction; confusing the two produces confident wrong answers.
- Correlating activity across **two separate user hives** via **MFT File References** — filesystem-level object identity that survives path differences and renames
- Resolving **known-folder GUIDs** to real paths, and cross-checking them rather than trusting recall
- Recognising `%TEMP%\Temp1_<archive>\` as evidence that an archive was **opened in Explorer**, not merely downloaded
- Reconstructing a collection-and-staging sequence from browsing behaviour alone

**Tooling built along the way:** RegRipper emits output in `BagMRU` tree order rather than chronological order, which made the sequence hard to read across two hives. I wrote [**dfirtable**](https://github.com/9t0wl/dfir-tools) to render delimited DFIR output as a sortable, filterable HTML report that merges multiple sources into a single timeline — that's public and reusable regardless of this Sherlock's status.

---

*Check back after retirement for the full walkthrough.*
