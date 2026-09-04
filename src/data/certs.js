// ─────────────────────────────────────────────────────────────
//  CERTS DATA  —  update status/progress here
//
//  Ordering is deliberate: blue-team credentials lead, offensive
//  certs follow as supporting context (attacker tradecraft →
//  better detection). Colors: green = achieved, amber = in
//  progress / exam pending, purple / pink = accent variants.
// ─────────────────────────────────────────────────────────────

export const certs = [
  {
    id: 'thm-soc-l1',
    name: 'TryHackMe SOC Level 1',
    fullName: 'Security Operations Center — Level 1 Learning Path',
    issuer: 'TryHackMe',
    status: 'achieved',
    color: 'green',
    progress: 100,
    desc: 'All 14 modules complete — SIEM triage, Windows/Linux log analysis, network forensics, malware fundamentals, and the 4-room capstone (Tempest, Boogeyman 1–3), culminating in full intrusion reconstruction from raw Elastic/Sysmon telemetry alone.',
  },
  {
    id: 'sal1',
    name: 'SAL1',
    fullName: 'Security Analyst Level 1',
    issuer: 'TryHackMe',
    status: 'active',
    color: 'amber',
    desc: 'Professional certification exam for the SOC Level 1 path. Learning path complete — exam scheduled next.',
  },
  {
    id: 'secplus',
    name: 'Security+',
    fullName: 'CompTIA Security+',
    issuer: 'CompTIA',
    status: 'active',
    color: 'amber',
    desc: 'Industry-standard baseline across threats and attacks, architecture, operations and incident response, governance and risk — the credential most SOC job descriptions screen for.',
  },
  {
    id: 'cpts',
    name: 'CPTS',
    fullName: 'Certified Penetration Testing Specialist',
    issuer: 'Hack The Box',
    status: 'achieved',
    color: 'purple',
    certId: 'HTBCERT-9B1E8C2D3F',
    desc: 'Full-scope enterprise pentest simulation — AD exploitation, cross-forest pivoting, and multi-stage attack chains across segmented infrastructure. The end-to-end attack path knowledge that detection coverage gets measured against.',
  },
  {
    id: 'crto',
    name: 'CRTO',
    fullName: 'Certified Red Team Operator',
    issuer: 'Zero-Point Security (RastaMouse)',
    status: 'achieved',
    color: 'purple',
    desc: 'Cobalt Strike red team operations under live EDR — Malleable C2, Artifact Kit evasion, AppLocker bypass, constrained delegation, inter-realm trust abuse. Directly relevant defensively: these are the exact evasion behaviours a SOC has to catch in telemetry.',
  },
  {
    id: 'cwes',
    name: 'HTB CWES',
    fullName: 'Certified Web Exploitation Specialist',
    issuer: 'Hack The Box',
    status: 'achieved',
    color: 'purple',
    certId: 'HTBCERT-C1B95CAF91',
    desc: 'Advanced web application exploitation — injection techniques, authentication bypass, and complex multi-stage web attack chains. The same lens applied in reverse when triaging web-layer alerts.',
  },
];
