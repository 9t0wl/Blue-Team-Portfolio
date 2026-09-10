// ─────────────────────────────────────────────────────────────
//  CASE FILES DATA  —  blue team / DFIR / SOC investigations
//
//  To add a new case:
//    1. Drop yourcase.md into src/writeups/
//    2. Add an entry below with writeup: () => import('../writeups/yourcase.md?raw')
//    3. Save — that's it.
// ─────────────────────────────────────────────────────────────

export const cases = [
  {
    id: 'boogeyman3',
    name: 'Boogeyman 3',
    platform: 'THM',
    category: 'DFIR / Log Analysis',
    diff: 'hard',
    tags: ['Elastic/Kibana', 'UAC Bypass', 'Fileless C2', 'AMSI/ETW Bypass', 'RC4', 'Mimikatz', 'Pass-the-Hash', 'DCSync', 'WinRM Lateral Movement'],
    date: '2026-09',
    writeup: () => import('../writeups/boogeyman3.md?raw'),
  },
  {
    id: 'baggage',
    name: 'Baggage',
    platform: 'HTB',
    category: 'DFIR / Registry Forensics · writeup embargoed (active)',
    diff: 'very-easy',
    tags: ['Shellbags', 'RegRipper', 'KAPE', 'Registry Forensics', 'MFT References', 'Known Folder GUIDs', 'Data Staging', 'Exfiltration'],
    date: '2026-09',
    writeup: () => import('../writeups/baggage.md?raw'),
  },
  {
    id: 'unit42',
    name: 'Unit42',
    platform: 'HTB',
    category: 'DFIR / Endpoint Forensics',
    diff: 'very-easy',
    tags: ['Sysmon', 'Chainsaw', 'Timestomping', 'MITRE ATT&CK', 'DNS Correlation', 'Phishing', 'UltraVNC'],
    date: '2026-09',
    writeup: () => import('../writeups/unit42.md?raw'),
  },
  {
    id: 'campfire-1',
    name: 'Campfire-1',
    platform: 'HTB',
    category: 'DFIR / AD Attack Forensics',
    diff: 'easy',
    tags: ['Kerberoasting', 'Active Directory', 'PowerView', 'Rubeus', 'Prefetch', 'PowerShell Script Block Logging', 'EZ Tools'],
    date: '2026-09',
    writeup: () => import('../writeups/campfire-1.md?raw'),
  },
  {
    id: 'recollection',
    name: 'Recollection',
    platform: 'HTB',
    category: 'DFIR / Memory Forensics',
    diff: 'easy',
    tags: ['Volatility3', 'PowerShell Obfuscation', 'Memory Forensics', 'VirusTotal', 'SMB Exfiltration', 'Typosquatting', 'Browser Forensics'],
    date: '2026-09',
    writeup: () => import('../writeups/recollection.md?raw'),
  },
  {
    id: 'rogueone',
    name: 'RogueOne',
    platform: 'HTB',
    category: 'DFIR / Memory Forensics',
    diff: 'easy',
    tags: ['Volatility3', 'Process Masquerading', 'C2 Detection', 'Metasploit', 'VirusTotal', 'MITRE ATT&CK', 'Memory Forensics'],
    date: '2026-09',
    writeup: () => import('../writeups/rogueone.md?raw'),
  },
];

// ── helpers ──────────────────────────────────────────────────
export const getCase       = (id) => cases.find((c) => c.id === id);
export const caseDiffOrder = { 'very-easy': 0, easy: 1, medium: 2, hard: 3, insane: 4 };
export const allCaseTags   = [...new Set(cases.flatMap((c) => c.tags))].sort();
