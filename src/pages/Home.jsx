import { useState, useEffect } from 'react';
import { cases } from '../data/cases';
import { certs } from '../data/certs';
import CaseCard from '../components/CaseCard';
import CertCard from '../components/CertCard';
import useReveal from '../components/useReveal';
import badgerImg from '../assets/dig-detect-defend.webp';
import styles from './Home.module.css';

const FILTERS = ['all', 'very-easy', 'easy', 'medium', 'hard', 'insane', 'THM', 'HTB'];

const tools = [
  {
    icon: '[ WEB ]',
    name: 'BLUE//TEAM Cheatsheet',
    desc: 'Live, searchable field reference built alongside the SOC L1 path — detection filters, phishing forensics, log-pivoting patterns, Sysmon/PowerShell/Elastic reference, 240+ entries and growing with every room.',
    lang: 'JavaScript · Vite · Elastic-flavored',
    href: 'https://9t0wl.github.io/blue-team-cheatsheet/',
    linkLabel: 'open the live cheatsheet →',
  },
  {
    icon: '[ PY ]',
    name: 'dfirtable',
    desc: 'Turns delimited DFIR tool output (RegRipper, Eric Zimmerman CSVs, anything tabular) into a self-contained interactive HTML report — sortable, live-filterable, column toggles, and multi-source merging so two user hives become one chronological timeline.',
    lang: 'Python 3 · stdlib only · no dependencies',
    href: 'https://github.com/9t0wl/dfir-tools',
  },
  {
    icon: '[ MD ]',
    name: 'Case-File Writeup Format',
    desc: 'Structured DFIR writeup template — Synopsis, Recon, Root Cause, Exploitation, Commands, Credentials, Flags, Takeaways — used for every capstone room and applied consistently enough to search across.',
    lang: 'Markdown · CyberMemoryBank',
    href: 'https://github.com/9t0wl',
  },
  {
    icon: '[ VOL ]',
    name: 'Volatility 3 Playbook',
    desc: 'Plugin map and triage order for memory-only investigations — pstree → cmdline → netscan → filescan → dumpfiles, plus the fileless-persistence and registry-payload patterns that keep showing up in real intrusions.',
    lang: 'Volatility 3 · Windows Memory Forensics',
    href: 'https://github.com/9t0wl',
  },
  {
    icon: '[ KQL ]',
    name: 'KQL / SPL Query Library',
    desc: 'Reusable pivots for Elastic and Splunk — process-tree walking via process.parent.pid, timestamp chaining, cross-log-source correlation via ECS, and the query gotchas that cost real investigation time.',
    lang: 'KQL · SPL · Elastic Common Schema',
    href: 'https://github.com/9t0wl',
  },
  {
    icon: '[ PS1 ]',
    name: 'Encoded-Payload Decode Toolkit',
    desc: 'CyberChef recipes and local scripts for the patterns that show up constantly in Windows intrusions — PowerShell -enc (UTF-16LE+Base64), AMSI/ETW bypass signatures, and RC4/XOR stager unwrapping.',
    lang: 'CyberChef · PowerShell · Python',
    href: 'https://github.com/9t0wl',
  },
  {
    icon: '[ SIG ]',
    name: 'Detection Rule Drafts',
    desc: 'Sigma and Suricata rules translated directly from things caught during investigations — registry-hijack UAC bypasses, reflection-based AMSI/ETW tampering, WinRM-delivered execution.',
    lang: 'Sigma · Suricata',
    href: 'https://github.com/9t0wl',
  },
];

export default function Home() {
  const [filter, setFilter] = useState('all');
  const [cursorPos, setCursorPos] = useState({ x: -500, y: -500 });
  const revealRef = useReveal();

  useEffect(() => {
    const move = (e) => setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', move, { passive: true });
    return () => window.removeEventListener('mousemove', move);
  }, []);

  const filtered = cases.filter(c =>
    filter === 'all' || c.diff === filter || c.platform === filter
  );

  return (
    <div ref={revealRef}>
      {/* Cursor glow */}
      <div
        className={styles.cursorGlow}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />

      {/* ── HERO ── */}
      <section className={styles.hero} id="hero">
        <div className={styles.heroContent}>
          <div className={styles.heroTag}>soc analyst // defensive security // las vegas, nv</div>

          <h1 className={styles.heroName}>
            <span className={styles.num}>9</span>
            <span className={styles.owl}>t0wl</span>
          </h1>

          <p className={styles.heroTitle}>
            <strong>SOC Analyst</strong> · Blue Team · DFIR &amp; Threat Detection
          </p>

          <div className={styles.heroBadges}>
            <span className="badge badge-g">TryHackMe SOC L1 — Complete</span>
            <span className="badge badge-a">SAL1 — Exam Pending</span>
            <span className="badge badge-p">3yr Red Team Background</span>
          </div>

          <div className={styles.heroCta}>
            <a href="#cases" className="btn btn-p">// view case files</a>
            <a
              href="https://9t0wl.github.io/blue-team-cheatsheet/"
              className="btn btn-g"
              target="_blank"
              rel="noopener noreferrer"
            >
              // browse the cheatsheet
            </a>
            <a href="#contact" className="btn btn-pk">// get in touch</a>
          </div>
        </div>

        <div className={styles.heroBadge}>
          <img
            src={badgerImg}
            alt="Blue Team — Dig, Detect, Defend"
            className={styles.badgeImg}
            width="1160"
            height="633"
            loading="eager"
            fetchPriority="high"
          />
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div className={styles.statsBar}>
        {[
          { num: '100%', label: 'SOC L1 Path',    color: 'var(--green)' },
          { num: '240+', label: 'Cheatsheet Entries', color: 'var(--purple2)' },
          { num: '4',    label: 'Capstone Rooms',  color: 'var(--purple2)' },
          { num: '3yr',  label: 'Red Team Background', color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} className={`${styles.statItem} reveal`}>
            <div className={styles.statNum} style={{ color: s.color }}>{s.num}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── CERTS ── */}
      <section id="certs" className={styles.section}>
        <div className={`${styles.sectionHeader} reveal`}>
          <div className="section-label">credentials</div>
          <h2 className="section-title">Certs &amp; <span className="accent-p">Achievements</span></h2>
          <div className="section-line" />
        </div>
        <div className={styles.certsGrid}>
          {certs.map((c, i) => (
            <div key={c.id} className="reveal" style={{ transitionDelay: `${i * 60}ms` }}>
              <CertCard cert={c} />
            </div>
          ))}
        </div>
      </section>

      {/* ── CASE FILES ── */}
      <section id="cases" className={styles.section}>
        <div className={`${styles.sectionHeader} reveal`}>
          <div className="section-label">soc &amp; dfir</div>
          <h2 className="section-title">Case <span className="accent-pk">Files</span></h2>
          <div className="section-line" />
        </div>

        <div className={`${styles.filters} reveal`}>
          {FILTERS.map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <div className={styles.boxesGrid}>
          {filtered.map((c, i) => (
            <div key={c.id} className="reveal" style={{ transitionDelay: `${i * 50}ms` }}>
              <CaseCard entry={c} />
            </div>
          ))}
        </div>

        <div className={`${styles.boxCount} reveal`}>
          <span>{filtered.length} case file{filtered.length !== 1 ? 's' : ''} published</span>
          {' · more added regularly '}
          <span className="blink">_</span>
        </div>
      </section>

      {/* ── TOOLS ── */}
      <section id="tools" className={styles.section}>
        <div className={`${styles.sectionHeader} reveal`}>
          <div className="section-label">development</div>
          <h2 className="section-title">Tools &amp; <span className="accent-g">References</span></h2>
          <div className="section-line" />
        </div>

        <div className={styles.toolsGrid}>
          {tools.map((t, i) => (
            <div key={t.name} className={`${styles.toolCard} reveal`} style={{ transitionDelay: `${i * 60}ms` }}>
              <div className={styles.toolIcon}>{t.icon}</div>
              <div className={styles.toolName}>{t.name}</div>
              <div className={styles.toolDesc}>{t.desc}</div>
              <div className={styles.toolLang}>{t.lang}</div>
              <a href={t.href} className={styles.toolLink} target="_blank" rel="noopener noreferrer">
                {t.linkLabel || 'view on github →'}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className={styles.section} style={{ textAlign: 'center' }}>
        <div className={`${styles.sectionHeader} reveal`} style={{ alignItems: 'center' }}>
          <div className="section-label" style={{ textAlign: 'center' }}>links</div>
          <h2 className="section-title">Get In <span className="accent-p">Touch</span></h2>
          <div className="section-line" style={{ maxWidth: 300, margin: '1rem auto 0' }} />
        </div>

        <p className={`${styles.contactBlurb} reveal`}>
          Open to SOC / Blue Team roles, threat hunting, and DFIR work — backed by two years of offensive security to read the other side of the log.
        </p>

        <div className={`${styles.contactGrid} reveal`}>
          {[
            { icon: '⬡', label: 'Red Team Portfolio', href: 'https://9t0wl.github.io/HTB-Portfolio/' },
            { icon: '◈', label: 'GitHub',              href: 'https://github.com/9t0wl' },
            { icon: '◉', label: 'LinkedIn',            href: 'https://www.linkedin.com/in/herry-hernandez-43100123b/' },
          ].map(l => (
            <a key={l.label} href={l.href} className={styles.contactLink} target="_blank" rel="noopener noreferrer">
              <span>{l.icon}</span> {l.label}
            </a>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <span className="accent-p">9t0wl</span> · SOC analyst · blue team · las vegas, nv
        <br /><br />
        <span className="blink">▮</span> built clean. no bs.
      </footer>
    </div>
  );
}
