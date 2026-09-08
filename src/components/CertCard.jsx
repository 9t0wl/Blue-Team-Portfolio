import styles from './CertCard.module.css';

// The lodge palette: verdigris for attained, gaslamp for in progress,
// brass for the offensive credentials that sit as supporting context.
const COLOR_MAP = {
  green:  { accent: 'var(--verdigris-lt)' },
  purple: { accent: 'var(--brass)' },
  pink:   { accent: 'var(--gaslamp)' },
  amber:  { accent: 'var(--gaslamp)' },
};

const STATUS_WORD = {
  achieved: 'Attained',
  active:   'In Progress',
};

const FILL_CLASS = {
  green:  'pf-g',
  purple: 'pf-p',
  pink:   'pf-pk',
  amber:  'pf-amber',
};

export default function CertCard({ cert }) {
  const { name, fullName, issuer, status, color, certId, score, progress, desc } = cert;
  const { accent } = COLOR_MAP[color] || COLOR_MAP.purple;

  return (
    <div className={styles.card} data-spot>
      <span className="hud" aria-hidden="true" />
      <div className={styles.accent} style={{ background: accent }} />

      <div className={styles.status} style={{ color: accent }}>
        &#10087;&ensp;{STATUS_WORD[status] || 'Active'}
      </div>

      <div className={styles.name} style={{ color: accent }}>{name}</div>
      <div className={styles.issuer}>{issuer} &middot; {fullName}</div>
      <div className={styles.desc}>{desc}</div>

      {certId && <div className={styles.certId}>{certId}</div>}

      {score && (
        <div className={styles.scoreRow}>
          <span className={styles.scoreLabel}>Exam score</span>
          <span style={{ color: accent, fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>{score}</span>
        </div>
      )}

      {progress !== undefined && (
        <div className={styles.progressWrap}>
          <div className={styles.progressLabel}>
            <span>Lab completion</span>
            <span style={{ color: accent }}>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${FILL_CLASS[color] || 'pf-p'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
