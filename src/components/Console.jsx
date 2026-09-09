import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cases } from '../data/cases';
import { coverageStats } from '../data/attack';
import useActiveSection from './useActiveSection';
import styles from './Console.module.css';

// Sections of the lodge, in the order they appear in the main pane. The
// index rail highlights whichever one you're currently reading.
const SECTIONS = [
  { id: 'lodge',       label: 'The Lodge',      mark: 'I' },
  { id: 'credentials', label: 'Credentials',    mark: 'II' },
  { id: 'methods',     label: 'Methods',        mark: 'III' },
  { id: 'casebook',    label: 'The Casebook',   mark: 'IV' },
  { id: 'apparatus',   label: 'The Apparatus',  mark: 'V' },
  { id: 'wire',        label: 'The Wire',       mark: 'VI' },
];

const SECTION_IDS = SECTIONS.map((s) => s.id);

/**
 * The console shell: brass masthead across the top, the index down the left,
 * and the main pane holding whatever route is active. Fixed chrome with a
 * scrolling pane is what makes this read as an instrument you operate rather
 * than a page you scroll.
 */
export default function Console({ children }) {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { active, progress } = useActiveSection(SECTION_IDS);
  const onHome = location.pathname === '/';
  const stats = coverageStats();

  // Lock the page behind the drawer so the sheet scrolls, not the pane under
  // it, and let Escape dismiss it.
  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawer]);

  // The crest doubles as "back to the top of the lodge". On the home page a
  // plain <Link to="/"> is a no-op, so handle the scroll ourselves.
  const goHome = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (!onHome) navigate('/');
    window.scrollTo({ top: 0, behavior: onHome ? 'smooth' : 'auto' });
  };

  // The index links are plain #hash anchors, which only work when already on
  // the Home page (native browser hash-scroll). From any other route they're
  // a no-op -- there's no element with that id to scroll to there. Off Home,
  // route back to "/" with the hash attached instead; Home reads it on mount
  // to scroll to the right section.
  const goToSection = (id) => (e) => {
    if (onHome || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(`/#${id}`);
  };

  const counters = [
    { label: 'Cases',   value: cases.length },
    { label: 'Methods', value: stats.techniqueCount },
    { label: 'Tactics', value: `${stats.tacticsCovered}/${stats.tacticsTotal}` },
  ];

  const indexBody = (
    <>
      <div className={styles.indexHead}>The Index</div>

      <ul className={styles.indexList}>
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={goToSection(s.id)}
              className={`${styles.indexLink} ${onHome && s.id === active ? styles.indexActive : ''}`}
              aria-current={onHome && s.id === active ? 'true' : undefined}
            >
              <span className={styles.mark}>{s.mark}</span>
              <span className={styles.indexLabel}>{s.label}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className={styles.indexRule} />

      <a
        href="https://9t0wl.github.io/blue-team-cheatsheet/"
        className={styles.indexLink}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={styles.mark}>&#8599;</span>
        <span className={styles.indexLabel}>Field Reference</span>
      </a>

      <div className={styles.indexRule} />

      <div className={styles.counters}>
        {counters.map((c) => (
          <div key={c.label} className={styles.counter}>
            <span className={styles.counterLabel}>{c.label}</span>
            <span className={styles.counterValue}>{c.value}</span>
          </div>
        ))}
      </div>

      <div className={styles.plate}>
        Est. Las Vegas
        <br />
        Consulting &middot; Defensive
      </div>
    </>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.masthead}>
        <Link to="/" className={styles.crest} onClick={goHome} title="Back to the top">
          <span className={styles.crestMark}>&#9737;</span>
          <span className={styles.crestText}>
            <span className={styles.crestName}>The Detective&rsquo;s Lodge</span>
            <span className={styles.crestSub}>9t0wl &middot; SOC Analyst</span>
          </span>
        </Link>

        <div className={styles.mastRight}>
          <span className={styles.doorPlate}>No. 221<span className={styles.plateB}>B</span></span>
          <button
            className={styles.drawerBtn}
            onClick={() => setDrawer((d) => !d)}
            aria-label="Open the index"
            aria-expanded={drawer}
          >
            <span /><span /><span />
          </button>
        </div>

        {/* how far through the lodge you've walked */}
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressFill} style={{ transform: `scaleX(${progress})` }} />
        </div>
      </header>

      <aside className={styles.index}>{indexBody}</aside>

      {drawer && (
        <>
          <div className={styles.scrim} onClick={() => setDrawer(false)} />
          <aside
            className={`${styles.index} ${styles.indexDrawer}`}
            onClick={(e) => { if (e.target.closest('a')) setDrawer(false); }}
          >
            {indexBody}
          </aside>
        </>
      )}

      <main className={styles.pane}>{children}</main>
    </div>
  );
}
