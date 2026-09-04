import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getCase, cases, caseDiffOrder } from '../data/cases';
import styles from './WriteupPage.module.css';

const DIFF_COLOR = {
  'very-easy': 'var(--green)',
  easy:   'var(--green)',
  medium: 'var(--amber)',
  hard:   'var(--pink)',
  insane: 'var(--purple2)',
};

// One config per content type — adding a new type (e.g. Sherlocks-only) means
// adding one more entry here, not a new page.
const TYPES = {
  case: {
    getItem: getCase,
    items: cases,
    diffOrder: caseDiffOrder,
    basePath: '/case',
    sectionLabel: 'cases',
    notFoundLabel: 'case',
    fieldKey: 'platform',
    fieldColor: { THM: '#e34f26', HTB: 'var(--green)' },
  },
};

export default function WriteupPage({ type = 'case' }) {
  const cfg           = TYPES[type];
  const { id }        = useParams();
  const navigate       = useNavigate();
  const item           = cfg.getItem(id);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!item) { setLoading(false); return; }

    setLoading(true);
    setContent('');
    setError(false);

    item.writeup()
      .then((mod) => {
        setContent(mod.default);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [id, type]);

  if (!item) {
    return (
      <div className={styles.notFound}>
        <div className={styles.nfCode}>404</div>
        <div className={styles.nfMsg}>// {cfg.notFoundLabel} not found</div>
        <Link to="/" className="btn btn-p" style={{ marginTop: '2rem' }}>← back home</Link>
      </div>
    );
  }

  const { name, diff, tags, date } = item;
  const fieldVal = item[cfg.fieldKey];

  const sorted = [...cfg.items].sort((a, b) => cfg.diffOrder[a.diff] - cfg.diffOrder[b.diff]);
  const idx    = sorted.findIndex((m) => m.id === id);
  const prev   = sorted[idx - 1];
  const next   = sorted[idx + 1];

  return (
    <div className={styles.page}>
      {/* Back / breadcrumb */}
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => navigate(-1)}>← back</button>
        <div className={styles.breadcrumb}>
          <Link to="/">9t0wl</Link>
          <span>/</span>
          <Link to={`/#${cfg.sectionLabel}`}>{cfg.sectionLabel}</Link>
          <span>/</span>
          <span>{name}</span>
        </div>
      </div>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.meta}>
          <span className={styles.diffBadge} style={{ color: DIFF_COLOR[diff], borderColor: DIFF_COLOR[diff] }}>
            {diff}
          </span>
          <span className={styles.osBadge}>
            <span className={styles.osDot} style={{ background: cfg.fieldColor[fieldVal] }} />
            {fieldVal}
          </span>
          {date && <span className={styles.dateBadge}>{date}</span>}
        </div>

        <h1 className={styles.title}>{name}</h1>

        <div className={styles.tags}>
          {tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
        </div>
      </header>

      {/* Body */}
      <article className={styles.article}>
        {loading && (
          <div className={styles.loading}>
            <span className="mono muted">// loading writeup</span>
            <span className="blink"> _</span>
          </div>
        )}
        {error && (
          <div className={styles.loading}>
            <span className="mono muted">// writeup file not found — drop the .md in src/writeups/</span>
          </div>
        )}
        {!loading && !error && (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        )}
      </article>

      {/* Prev / Next */}
      <nav className={styles.prevNext}>
        {prev ? (
          <Link to={`${cfg.basePath}/${prev.id}`} className={styles.navBtn}>
            <span className={styles.navDir}>← prev</span>
            <span className={styles.navName}>{prev.name}</span>
          </Link>
        ) : <div />}
        {next ? (
          <Link to={`${cfg.basePath}/${next.id}`} className={`${styles.navBtn} ${styles.navRight}`}>
            <span className={styles.navDir}>next →</span>
            <span className={styles.navName}>{next.name}</span>
          </Link>
        ) : <div />}
      </nav>
    </div>
  );
}
