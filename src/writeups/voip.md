# HTB Sherlock: VoIP (Full Writeup)

**Category:** Network Forensics / VoIP (Vishing) | **Platform:** Hack The Box (Sherlock) | **Difficulty:** Easy | **Solved:** October 2026

---

## Synopsis

James got a call from someone claiming to be his bank, who pressed him for sensitive information. The evidence is a packet capture of that call. The job is to rebuild it from the wire: who called whom, when, for how long, under what caller ID, and what was actually said.

**Chain:** caller places a call through the PBX under the display name `"Bank"` → PBX answers the caller leg and bridges a second leg to James's phone → roughly 88 seconds of unencrypted G.711 audio → caller hangs up with a SIP `BYE`. The audio itself, rebuilt from the RTP packets, names the "bank" and contains James reading out his Social number.

Most of the questions are answerable from SIP headers alone. The last two need the audio, and on this box that meant working around an RDP session with no sound device. The workaround is the most reusable part of this writeup.

---

## Background: the three protocols in a VoIP call

| Protocol | Role | In this capture |
|---|---|---|
| **SIP** (Session Initiation Protocol) | Signalling: set up, ring, answer, hang up. Text-based, HTTP-like, UDP/5060. Carries no audio. | `INVITE`, `401`, `100 Trying`, `180 Ringing`, `200 OK`, `ACK`, `BYE` |
| **SDP** (Session Description Protocol) | Rides inside SIP and announces the IP, port and codec for the audio | Negotiates G.711 µ-law (PCMU) |
| **RTP** (Real-time Transport Protocol) | The voice itself: one packet per ~20 ms of audio, per direction | 18,348 of 18,584 packets |

RTCP (RTP Control Protocol) is the quality-stats sidecar to RTP and shows up as `Receiver Report` packets. A useful analogy: SIP is the dialling and ringing, RTP is the conversation, and `BYE` is putting the phone down.

---

## Environment and evidence

Access is RDP only, because the Sherlock expects you to listen to the call:

```bash
xfreerdp /v:<ip> /u:letsdefend /p:'' /cert:ignore /dynamic-resolution
```

The evidence is `Desktop\ChallengeFile\Bank Incident.7z`, a single unencrypted file, `Traffic.pcapng` (4.6 MB, 18,584 packets, captured 2024-05-03). Extract it with 7-Zip and open it in Wireshark.

**Hosts**

| IP | Role | How we know |
|---|---|---|
| `192.168.245.1` | Caller ("Bank") | Source of the first `INVITE` and the final `BYE` |
| `192.168.245.128` | PBX | Answers `401` / `200 OK` and re-originates the call. The `as` prefix on its SIP tags (`tag=as02b60037`) is Asterisk's convention. |
| `192.168.245.130` | James's phone | Target of the PBX's second `INVITE`, extension 7001 |

---

## Investigation

### Task 0: how many RTP packets?

**Filter:** `rtp`

*Why this one:* the question counts voice packets only, so `udp` would overcount (it includes SIP and RTCP). Read the **Displayed** count in the status bar: **18,348** (98.7% of the capture).

Wireshark already labelled the media as RTP, because it saw the SDP inside the SIP setup announce the media ports. If a capture starts mid-call and misses that setup, `rtp` returns nothing. The fix is *Analyze → Enabled Protocols → rtp_udp*, or *Decode As* on the media port.

### Task 1: when did the call start? (UTC)

**First:** *View → Time Display Format → UTC Date and Time of Day*

*Why first:* Wireshark shows local time by default, and the question asks for UTC. Changing the display before reading anything removes a whole class of off-by-hours mistakes. The packet details pane confirms it with *Arrival Time: … Coordinated Universal Time*.

**Filter:** `sip.Method == "INVITE"`

*Why `sip.Method`:* SIP **requests** start with a method (INVITE, ACK, BYE) and **responses** start with a status code (`180`, `200`, `401`). Filtering on the method drops all the responses and leaves only the call-setup requests, which in this capture is three packets.

| Pkt | Time (UTC) | Flow | What it is |
|---|---|---|---|
| 5 | 20:36:36.473919 | `.1` → `.128` | First INVITE to `sip:7001` |
| 6 | | `.128` → `.1` | `401 Unauthorized`, a digest-auth challenge |
| 8 | 20:36:36.475362 | `.1` → `.128` | INVITE again, now with credentials |
| 10 | | `.128` → `.1` | `200 OK`. The PBX answers the caller's leg. |
| 14 | 20:36:36.480054 | `.128` → `.130` | PBX re-originates the call to James |
| 16 | | `.130` → `.128` | `180 Ringing` |

All three INVITEs land in the same second, so the answer is unambiguous: **2024-05-03 20:36:36**.

### Tasks 2 and 4: James's number and the bank's number

Expand packet 14's *Session Initiation Protocol → Message Header*, or open *Telephony → VoIP Calls*, which puts both headers in columns:

```
From: "Bank" <sip:01326947697@192.168.245.128>
To:   <sip:7001@192.168.245.130:59836;ob>
```

- **James:** `7001`, the user part of the `To:` URI on the leg to his phone.
- **Bank:** `01326947697`, the user part of the `From:` URI.

> **Caller ID is not authentication.** The `From:` header, including the friendly display name `"Bank"`, is plain text that the calling client writes itself. Nothing in SIP verifies it. That is the whole mechanism behind caller-ID spoofing in vishing: the victim's phone shows whatever the attacker typed.

### Task 3: how long was the call?

The obvious tool fails here. *Telephony → VoIP Calls* lists both legs as `CALL SETUP` with a duration of `00:00:00`. Wireshark didn't track the call through to a completed state, so it never computed a duration. The packets are fine, so measure from them directly.

**Filter:** `sip.Method == "BYE"`

| Pkt | Time (UTC) | Flow |
|---|---|---|
| 18576 | 20:38:12.166498 | `.1` → `.128`, the caller hangs up |
| 18579 | 20:38:12.171080 | `.128` → `.130`, the PBX relays the hang-up to James |

20:38:12.166 minus 20:36:36.474 is 95.7 s, which gives **00:01:35**. The RTP Streams dialog gives an independent check: the caller's stream to the PBX has a duration of **95.64 s**.

### Mapping the media: six streams, two legs

*Telephony → RTP → RTP Streams*

> **Gotcha:** the dialog opened **empty**. *Limit to display filter* is ticked by default, and the main window still had `sip.Method == "INVITE"` applied, so the dialog only looked at three SIP packets. Untick it, or clear the filter before opening. Any Wireshark dialog that inherits the display filter can look empty when the data is there.

| Source → Destination | SSRC | Start (s) | Duration | Packets | What it is |
|---|---|---|---|---|---|
| `192.168.1.7` → PBX | `0x055178b7` | 4.34 | 95.64 s | 4,783 | Caller's voice, whole call |
| `192.168.245.1` → PBX | `0x055178b7` | 4.32 | 0 | 1 | First packet of the same stream, different source IP |
| PBX → caller | `0x2ebf6736` | 4.33 | 7.88 s | 395 | PBX audio to the caller before James picks up |
| PBX → James | `0x055178b7` | 12.22 | 87.76 s | 4,389 | Caller's voice relayed to James |
| James → PBX | `0x28337874` | 12.22 | 87.77 s | 4,390 | **James's voice** |
| PBX → caller | `0x28337874` | 12.22 | 87.77 s | 4,390 | James's voice relayed to the caller |

The packet counts sum to exactly 18,348, which matches Task 0. Reading the table:

- **The PBX is a back-to-back user agent.** It answered the caller at 4.3 s, played its own audio for about 8 s, and bridged a second leg to James, who picked up at about 12.2 s. One phone call is really two calls stitched together. That is why the "call with the bank" (95.6 s, caller leg) is longer than the actual conversation with James (87.8 s).
- **SSRCs pass through unchanged.** `0x055178b7` (the caller) and `0x28337874` (James) appear on both legs, so you can follow each voice across the PBX.
- The single packet from `192.168.245.1`, followed by the rest of the same SSRC from `192.168.1.7`, means the caller's media came from a second address. It's the same SSRC, so it's the same speaker. It doesn't change any answer, but it's the kind of detail worth noting rather than ignoring.

### Tasks 5 and 6: getting the audio out over RDP

The remaining questions are only answerable by listening. Select the James-leg pair (PBX → James and James → PBX), click **Play Streams**, and the RTP Player decodes both sides into a waveform, one lane per speaker.

Then playback fails:

```
Playback of stream 192.168.245.130:4004 - 192.168.245.128:16972 0x28337874 failed!
```

**Why:** the decoding worked, and the waveform is right there. The RDP session has no audio output device, because the RDP client wasn't redirecting sound to anything. Wireshark has nowhere to send the samples.

**Fix: export the audio and move the file instead of the sound.**

1. **Export from the RTP Player.** *Export ▼ → Stream Synchronized Audio*, saved as `call.wav`.
   *Why this option:* "synchronized" mixes both speakers on their real timeline, so the WAV sounds like the conversation. Exporting a single stream gives you one side only. The resulting file was 14.8 MiB for about 88 s, because Wireshark writes it at its 44.1 kHz playback rate (the `PR (Hz) 44100` column), not the 8 kHz telephone rate.

2. **Reconnect RDP with a drive share.**
   ```bash
   mkdir -p ~/loot
   xfreerdp /v:<ip> /u:letsdefend /p:'' /cert:ignore /dynamic-resolution /drive:loot,/home/kali/loot
   ```
   *Why:* `/drive:<name>,<path>` maps a folder on the attack box into the remote session. It appears under **This PC** in Explorer on the target. That gives you a file transfer channel without needing any network service on the target. Reconnecting loses nothing, because the WAV is already on the target's disk.

3. **Copy `call.wav` into the `loot` drive in Explorer**, then play it locally (VLC on Kali).

The alternative would have been redirecting audio (`xfreerdp /sound`), but that only helps if the RDP client machine has a working sound output. Exporting works regardless, and it also leaves you with an evidence file you can hash, keep and replay.

**From the audio:**
- **Task 5:** the caller identifies as **Bank of Wealth**.
- **Task 6:** James reads out his Social number, **5678**.

---

## Command and filter list (in order)

| # | Action | Purpose |
|---|---|---|
| 1 | `xfreerdp /v:<ip> /u:letsdefend /p:'' /cert:ignore /dynamic-resolution` | Connect to the analysis VM |
| 2 | 7-Zip → Extract `Bank Incident.7z` | Get `Traffic.pcapng` |
| 3 | `rtp` | Task 0, count voice packets |
| 4 | View → Time Display Format → UTC Date and Time of Day | Answer in UTC |
| 5 | `sip.Method == "INVITE"` | Task 1 start time, Tasks 2 and 4 From/To headers |
| 6 | Telephony → VoIP Calls | From/To at a glance (duration column was unusable) |
| 7 | `sip.Method == "BYE"` | Task 3, end of call |
| 8 | Telephony → RTP → RTP Streams (untick *Limit to display filter*) | Map the six streams |
| 9 | Play Streams → Export → Stream Synchronized Audio | Write `call.wav` |
| 10 | `xfreerdp ... /drive:loot,/home/kali/loot` | Pull the WAV off the target |
| 11 | Play `call.wav` locally | Tasks 5 and 6 |

---

## Answers

| Task | Question | Answer |
|---|---|---|
| 0 | RTP packets in the traffic | `18348` |
| 1 | When the fake call started (UTC) | `2024-05-03 20:36:36` |
| 2 | James's phone number | `7001` |
| 3 | Length of the call with the bank | `00:01:35` |
| 4 | The bank's phone number | `01326947697` |
| 5 | Name of the bank | `Bank of Wealth` |
| 6 | James's Social number | `5678` |

---

## Key Takeaways

- **SIP sets the call up; RTP is the call.** Headers answer who, when and how long. Only the RTP payload answers what was said.
- **Unencrypted RTP means the conversation is in the pcap.** Anyone positioned to capture G.711 RTP can replay the call. SRTP exists to prevent exactly this.
- **Caller ID is attacker-controlled text.** `From: "Bank"` is a string, not an identity.
- **When a tool's summary is blank, go to the packets.** VoIP Calls showed `00:00:00` and RTP Streams showed nothing. The data was fine both times: one was a tracking limitation, the other was an inherited display filter.
- **A PBX makes one call into two legs.** Expect the caller leg and the callee leg to have different durations, and know which one the question means.
- **No sound over RDP is a transport problem, not an evidence problem.** Export the decoded audio to a file and move the file (`/drive:` redirection). You also end up with an artifact you can keep.

---

## Detection Opportunities

- Flag inbound calls whose SIP `From:` display name claims an institution ("Bank", "IRS", "Support") but whose number isn't on a known list for that institution.
- On the PBX, alert on external or unexpected sources that complete digest auth (`401` → authenticated `INVITE`) and immediately place calls to internal extensions.
- Enforce SRTP and SIP over TLS internally, so a passive capture no longer yields the audio.
- Most of the defence is user-side: banks don't call to ask for identity numbers, so the control that would have stopped this is "hang up and call the number on the back of the card".
