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
];

// ── helpers ──────────────────────────────────────────────────
export const getCase       = (id) => cases.find((c) => c.id === id);
export const caseDiffOrder = { 'very-easy': 0, easy: 1, medium: 2, hard: 3, insane: 4 };
export const allCaseTags   = [...new Set(cases.flatMap((c) => c.tags))].sort();
