import { useState } from 'react';
import { cases } from '../data/cases';
import { certs } from '../data/certs';
import CaseCard from '../components/CaseCard';
import CertCard from '../components/CertCard';
import AttackMatrix from '../components/AttackMatrix';
import BootSequence from '../components/BootSequence';
import DecryptText from '../components/DecryptText';
import CountUp from '../components/CountUp';
import Pane from '../components/Pane';
import { willBoot } from '../components/bootState';
import useReveal from '../components/useReveal';
import useSpotlight from '../components/useSpotlight';
import badgerImg from '../assets/detectives-lodge.webp';
import styles from './Home.module.css';

const FILTERS = ['all', 'very-easy', 'easy', 'medium', 'hard', 'insane', 'THM', 'HTB'];

const apparatus = [
  {
    mark: 'WEB',
    name: 'Blue Team Field Reference',
    desc: 'Live, searchable field reference built alongside the SOC L1 path: detection filters, phishing forensics, log-pivoting patterns, Sysmon/PowerShell/Elastic reference. 240+ entries, growing with every room.',
    lang: 'JavaScript · Vite · Elastic-flavoured',
    href: 'https://9t0wl.github.io/blue-team-cheatsheet/',
    linkLabel: 'consult the reference',
  },
  {
    mark: 'PY',
    name: 'dfirtable',
    desc: 'Turns delimited DFIR tool output (RegRipper, Eric Zimmerman CSVs, anything tabular) into a self-contained interactive HTML report: sortable, live-filterable, column toggles, and multi-source merging so two user hives become one chronological timeline.',
    lang: 'Python 3 · stdlib only · no dependencies',
    href: 'https://github.com/9t0wl/dfir-tools',
  },
  {
    mark: 'MD',
    name: 'The Case-File Format',
    desc: 'Structured DFIR writeup template (Synopsis, Recon, Root Cause, Exploitation, Commands, Credentials, Flags, Takeaways) applied consistently enough across every capstone to search sideways through.',
    lang: 'Markdown · CyberMemoryBank',
    href: 'https://github.com/9t0wl',
  },
  {
    mark: 'VOL',
    name: 'Volatility 3 Playbook',
    desc: 'Plugin map and triage order for memory-only investigations: pstree, cmdline, netscan, filescan, dumpfiles, plus the fileless-persistence and registry-payload patterns that keep resurfacing in real intrusions.',
    lang: 'Volatility 3 · Windows Memory Forensics',
    href: 'https://github.com/9t0wl',
  },
  {
    mark: 'KQL',
    name: 'Query Library',
    desc: 'Reusable pivots for Elastic and Splunk: process-tree walking via process.parent.pid, timestamp chaining, cross-log-source correlation via ECS, and the query gotchas that cost real investigation time.',
    lang: 'KQL · SPL · Elastic Common Schema',
    href: 'https://github.com/9t0wl',
  },
  {
    mark: 'PS1',
    name: 'Decode Toolkit',
    desc: 'CyberChef recipes and local scripts for the patterns that show up constantly in Windows intrusions: PowerShell -enc (UTF-16LE + Base64), AMSI/ETW bypass signatures, and RC4/XOR stager unwrapping.',
    lang: 'CyberChef · PowerShell · Python',
    href: 'https://github.com/9t0wl',
  },
  {
    mark: 'SIG',
    name: 'Detection Rule Drafts',
    desc: 'Sigma and Suricata rules translated directly from things caught during investigations: registry-hijack UAC bypasses, reflection-based AMSI/ETW tampering, WinRM-delivered execution.',
    lang: 'Sigma · Suricata',
    href: 'https://github.com/9t0wl',
  },
];

const correspondence = [
  {
    mark: '⚔',
    label: 'The Offensive Casebook',
    sub: 'HTB portfolio',
    href: 'https://9t0wl.github.io/HTB-Portfolio/',
  },
  { mark: '⌗', label: 'GitHub', sub: 'source & tooling', href: 'https://github.com/9t0wl' },
  {
    mark: '✉',
    label: 'LinkedIn',
    sub: 'correspondence',
    href: 'https://www.linkedin.com/in/herry-hernandez-43100123b/',
  },
];

export default function Home() {
  const [filter, setFilter] = useState('all');
  const revealRef = useReveal();
  useSpotlight();

  // Hold the name's decrypt until the lamps are lit, otherwise it resolves
  // behind the boot overlay and the visitor only ever sees the result.
  const [nameDelay] = useState(() => (willBoot() ? 2350 : 420));

  const filtered = cases.filter(
    (c) => filter === 'all' || c.diff === filter || c.platform === filter
  );

  return (
    <div ref={revealRef}>
      <BootSequence />

      {/* ── I · THE LODGE ── */}
      <section className={styles.lodge} id="lodge">
        <div className={styles.lodgeContent}>
          <div className={styles.eyebrow}>
            Consulting Analyst &middot; Defensive Security &middot; Las Vegas
          </div>

          <DecryptText
            as="h1"
            className={styles.name}
            speed={72}
            delay={nameDelay}
            parts={[{ t: '9', c: styles.nameNum }, { t: 't0wl', c: styles.nameWord }]}
          />

          <p className={styles.creed}>
            &ldquo;You see, but you do not <em>observe</em>.&rdquo;
          </p>

          <p className={styles.summary}>
            <strong>SOC Analyst.</strong> Blue team, DFIR and threat detection.
            Three years spent running the attacks, now spent reading them back out of
            the evidence they leave behind.
          </p>

          <div className={styles.badges}>
            <span className="badge badge-g">TryHackMe SOC L1 &middot; Complete</span>
            <span className="badge badge-a">CDSA &middot; In Progress</span>
            <span className="badge badge-p">3yr Red Team Background</span>
          </div>

          <div className={styles.actions}>
            <a href="#casebook" className="btn">Open the casebook</a>
            <a
              href="https://9t0wl.github.io/blue-team-cheatsheet/"
              className="btn btn-g"
              target="_blank"
              rel="noopener noreferrer"
            >
              Field reference
            </a>
            <a href="#wire" className="btn btn-pk">Send word</a>
          </div>
        </div>

        <div className={styles.emblem} style={{ '--emblem': `url(${badgerImg})` }}>
          <img
            src={badgerImg}
            alt="The Detective's Lodge - Dig for clues, Deduce, Defend"
            className={styles.emblemImg}
            width="1408"
            height="768"
            loading="eager"
            fetchPriority="high"
          />
        </div>
      </section>

      {/* ── THE GAUGES ── */}
      <div className={styles.gauges}>
        {[
          { num: '100%', label: 'SOC L1 Path' },
          { num: '240+', label: 'Reference Entries' },
          { num: '4', label: 'Capstone Rooms' },
          { num: '3yr', label: 'Offensive Background' },
        ].map((g) => (
          <div key={g.label} className={`${styles.gauge} reveal`}>
            <CountUp value={g.num} className={styles.gaugeNum} />
            <div className={styles.gaugeLabel}>{g.label}</div>
          </div>
        ))}
      </div>

      {/* ── II · CREDENTIALS ── */}
      <Pane
        id="credentials"
        mark="II"
        label="Credentials"
        meta={`${certs.length} on file`}
        titleParts={[{ t: 'The ' }, { t: 'Credentials', c: 'accent-p' }]}
        blurb="Certifications held and in progress. The offensive ones are listed deliberately: knowing exactly how an attack is run is what makes the telemetry it produces legible."
      >
        <div className={styles.certGrid}>
          {certs.map((c, i) => (
            <div key={c.id} className="reveal" style={{ transitionDelay: `${i * 60}ms` }}>
              <CertCard cert={c} />
            </div>
          ))}
        </div>
      </Pane>

      {/* ── III · METHODS OBSERVED ── */}
      <Pane
        id="methods"
        mark="III"
        label="Methods Observed"
        meta="MITRE ATT&CK Enterprise"
        titleParts={[{ t: 'Methods ' }, { t: 'Observed', c: 'accent-pk' }]}
        blurb="Adversary techniques traced through host and log evidence, mapped to MITRE ATT&CK. Built straight from the casebook below. Tooling and forensic artefacts are deliberately excluded, so a lit cell means the method was investigated, not that the tool was named."
      >
        <AttackMatrix />
      </Pane>

      {/* ── IV · THE CASEBOOK ── */}
      <Pane
        id="casebook"
        mark="IV"
        label="The Casebook"
        meta={`${cases.length} filed`}
        titleParts={[{ t: 'The ' }, { t: 'Casebook', c: 'accent-p' }]}
        blurb="Investigations worked end to end, from first alert to reconstructed intrusion. Each entry opens into the full case file."
      >
        <div className={`${styles.query} reveal`}>
          <span className={styles.queryMark}>&#8981;</span>
          <span className={styles.queryLabel}>Filter the casebook</span>
          <div className={styles.filters}>
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`${styles.filterBtn} ${filter === f ? styles.filterOn : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.caseList}>
          {filtered.map((c, i) => (
            <div key={c.id} className="reveal" style={{ transitionDelay: `${i * 55}ms` }}>
              <CaseCard entry={c} index={i} />
            </div>
          ))}
        </div>

        <div className={`${styles.tally} reveal`}>
          {filtered.length} case{filtered.length !== 1 ? 's' : ''} shown
          {filter !== 'all' && ` of ${cases.length} filed`}
          {' · the casebook grows '}
          <span className="blink">_</span>
        </div>
      </Pane>

      {/* ── V · THE APPARATUS ── */}
      <Pane
        id="apparatus"
        mark="V"
        label="The Apparatus"
        meta={`${apparatus.length} instruments`}
        titleParts={[{ t: 'The ' }, { t: 'Apparatus', c: 'accent-g' }]}
        blurb="Tools, references and working method. Most of it was built because an investigation needed it and nothing on hand did the job."
      >
        <div className={styles.apparatusGrid}>
          {apparatus.map((t, i) => (
            <a
              key={t.name}
              href={t.href}
              className={`${styles.instrument} reveal`}
              style={{ transitionDelay: `${i * 55}ms` }}
              target="_blank"
              rel="noopener noreferrer"
              data-spot
            >
              <span className="hud" aria-hidden="true" />
              <div className={styles.instMark}>{t.mark}</div>
              <div className={styles.instName}>{t.name}</div>
              <div className={styles.instDesc}>{t.desc}</div>
              <div className={styles.instFoot}>
                <span className={styles.instLang}>{t.lang}</span>
                <span className={styles.instLink}>{t.linkLabel || 'examine'} &rarr;</span>
              </div>
            </a>
          ))}
        </div>
      </Pane>

      {/* ── VI · THE WIRE ── */}
      <Pane
        id="wire"
        mark="VI"
        label="The Wire"
        meta="open to enquiries"
        titleParts={[{ t: 'Send ' }, { t: 'Word', c: 'accent-pk' }]}
        blurb="Open to SOC, blue team, threat hunting and DFIR work. Backed by three years on the offensive side, which is the shortest route to reading the other end of a log."
      >
        <div className={styles.wireGrid}>
          {correspondence.map((l, i) => (
            <a
              key={l.label}
              href={l.href}
              className={`${styles.wireLink} reveal`}
              style={{ transitionDelay: `${i * 70}ms` }}
              target="_blank"
              rel="noopener noreferrer"
              data-spot
            >
              <span className="hud" aria-hidden="true" />
              <span className={styles.wireMark}>{l.mark}</span>
              <span className={styles.wireText}>
                <span className={styles.wireLabel}>{l.label}</span>
                <span className={styles.wireSub}>{l.sub}</span>
              </span>
              <span className={styles.wireArrow}>&rarr;</span>
            </a>
          ))}
        </div>
      </Pane>

      <footer className={styles.footer}>
        <div className="rule" />
        <div className={styles.footInner}>
          <span className={styles.footCrest}>&#9737;</span>
          <span>The Detective&rsquo;s Lodge &middot; No. 221B &middot; Las Vegas</span>
          <span className={styles.footMotto}>Dig &middot; Deduce &middot; Defend</span>
        </div>
      </footer>
    </div>
  );
}
