import styles from './CertCard.module.css';

const COLOR_MAP = {
  green:  { accent: 'var(--green)',   cls: 'cg' },
  purple: { accent: 'var(--purple)',  cls: 'cp' },
  pink:   { accent: 'var(--pink)',    cls: 'cpk' },
  amber:  { accent: 'var(--amber)',   cls: 'ca' },
};

const FILL_CLASS = {
  green:  'pf-g',
  purple: 'pf-p',
  pink:   'pf-pk',
  amber:  'pf-amber',
};

export default function CertCard({ cert }) {
  const { name, fullName, issuer, status, color, certId, score, progress, desc } = cert;
  const { accent, cls } = COLOR_MAP[color] || COLOR_MAP.purple;

  return (
    <div className={`${styles.card} ${styles[cls]}`}>
      <div className={styles.accent} style={{ background: accent }} />

      <div className={styles.status} style={{ color: accent }}>
        {status === 'achieved' ? '[ ACHIEVED ]' : status === 'active' ? '[ IN PROGRESS ]' : '[ ACTIVE ]'}
      </div>

      <div className={styles.name} style={{ color: accent }}>{name}</div>
      <div className={styles.issuer}>{issuer} · {fullName}</div>
      <div className={styles.desc}>{desc}</div>

      {certId && <div className={styles.certId}>{certId}</div>}

      {score && (
        <div className={styles.scoreRow}>
          <span className={styles.scoreLabel}>exam score</span>
          <span style={{ color: accent, fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>{score}</span>
        </div>
      )}

      {progress !== undefined && (
        <div className={styles.progressWrap}>
          <div className={styles.progressLabel}>
            <span>lab completion</span>
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
