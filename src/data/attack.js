// ─────────────────────────────────────────────────────────────
//  MITRE ATT&CK COVERAGE
//
//  The matrix on the home page is DERIVED, not hand-maintained.
//  Every case in cases.js is already tagged with what it involved;
//  this file is the single translation layer from those tags to
//  Enterprise ATT&CK techniques.
//
//  To light up a new cell: tag the case in cases.js. If the tag is
//  new, add one line to TAG_TECHNIQUES below. Nothing else changes.
//
//  Deliberately NOT mapped: tooling and artifact tags (Sysmon,
//  KAPE, RegRipper, Chainsaw, EZ Tools, Prefetch, Elastic/Kibana).
//  Those are how the technique was found, not the technique — and
//  claiming coverage off a tool name is exactly the kind of thing
//  a hiring manager checks.
// ─────────────────────────────────────────────────────────────

import { cases } from './cases';

// Enterprise tactics, in kill-chain order. Pre-compromise tactics
// (Reconnaissance, Resource Development) are omitted — nothing in a
// host/log forensics case file legitimately covers them.
export const TACTICS = [
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
];

// tag (as written in cases.js) → ATT&CK technique
const TAG_TECHNIQUES = {
  'Phishing':                        { id: 'T1566.001', name: 'Spearphishing Attachment', tactics: ['Initial Access'] },
  'PowerShell Script Block Logging': { id: 'T1059.001', name: 'PowerShell',               tactics: ['Execution'] },
  'UAC Bypass':                      { id: 'T1548.002', name: 'Bypass User Account Control', tactics: ['Privilege Escalation', 'Defense Evasion'] },
  'AMSI/ETW Bypass':                 { id: 'T1562.001', name: 'Disable or Modify Tools',  tactics: ['Defense Evasion'] },
  'RC4':                             { id: 'T1027',     name: 'Obfuscated Files or Information', tactics: ['Defense Evasion'] },
  'Timestomping':                    { id: 'T1070.006', name: 'Timestomp',               tactics: ['Defense Evasion'] },
  'Mimikatz':                        { id: 'T1003.001', name: 'LSASS Memory',            tactics: ['Credential Access'] },
  'DCSync':                          { id: 'T1003.006', name: 'DCSync',                  tactics: ['Credential Access'] },
  'Kerberoasting':                   { id: 'T1558.003', name: 'Kerberoasting',           tactics: ['Credential Access'] },
  'Rubeus':                          { id: 'T1558.003', name: 'Kerberoasting',           tactics: ['Credential Access'] },
  'PowerView':                       { id: 'T1087.002', name: 'Domain Account Discovery', tactics: ['Discovery'] },
  'Shellbags':                       { id: 'T1083',     name: 'File and Directory Discovery', tactics: ['Discovery'] },
  'Pass-the-Hash':                   { id: 'T1550.002', name: 'Pass the Hash',           tactics: ['Lateral Movement', 'Defense Evasion'] },
  'WinRM Lateral Movement':          { id: 'T1021.006', name: 'Windows Remote Management', tactics: ['Lateral Movement'] },
  'Data Staging':                    { id: 'T1074.001', name: 'Local Data Staging',      tactics: ['Collection'] },
  'Fileless C2':                     { id: 'T1071.001', name: 'Web Protocols',           tactics: ['Command and Control'] },
  'DNS Correlation':                 { id: 'T1071.004', name: 'DNS',                     tactics: ['Command and Control'] },
  'UltraVNC':                        { id: 'T1219',     name: 'Remote Access Software',  tactics: ['Command and Control'] },
  'Exfiltration':                    { id: 'T1041',     name: 'Exfiltration Over C2 Channel', tactics: ['Exfiltration'] },
};

/**
 * Build the coverage matrix from the case files.
 * Returns one entry per tactic, each holding the techniques observed in that
 * tactic and which case files they were observed in. Techniques that map to
 * two tactics (Pass-the-Hash, UAC Bypass) legitimately appear under both.
 */
export function buildCoverage() {
  const byTactic = Object.fromEntries(TACTICS.map((t) => [t, new Map()]));

  for (const c of cases) {
    for (const tag of c.tags) {
      const tech = TAG_TECHNIQUES[tag];
      if (!tech) continue;

      for (const tactic of tech.tactics) {
        const bucket = byTactic[tactic];
        if (!bucket) continue;

        // Two tags can resolve to the same technique (Kerberoasting +
        // Rubeus). Key on the technique id so the cell appears once with
        // every contributing case listed on it.
        const existing = bucket.get(tech.id);
        if (existing) {
          if (!existing.cases.some((x) => x.id === c.id)) {
            existing.cases.push({ id: c.id, name: c.name });
          }
        } else {
          bucket.set(tech.id, {
            id: tech.id,
            name: tech.name,
            cases: [{ id: c.id, name: c.name }],
          });
        }
      }
    }
  }

  return TACTICS.map((tactic) => ({
    tactic,
    techniques: [...byTactic[tactic].values()].sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

export const coverageStats = () => {
  const cov = buildCoverage();
  const covered = cov.filter((t) => t.techniques.length > 0);
  const techniqueIds = new Set(cov.flatMap((t) => t.techniques.map((x) => x.id)));
  return {
    tacticsCovered: covered.length,
    tacticsTotal: TACTICS.length,
    techniqueCount: techniqueIds.size,
    caseCount: cases.length,
  };
};
