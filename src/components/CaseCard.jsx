import { Link } from 'react-router-dom';
import styles from './CaseCard.module.css';

const DIFF_COLOR = {
  'very-easy': 'green',
  easy:        'green',
  medium:      'amber',
  hard:        'pink',
  insane:      'purple',
};

const PLATFORM_COLOR = {
  THM: '#e34f26',
  HTB: 'var(--green)',
};

export default function CaseCard({ entry }) {
  const { id, name, platform, category, diff, tags, date } = entry;
  const color = DIFF_COLOR[diff];

  return (
    <Link to={`/case/${id}`} className={`${styles.card} ${styles[diff]}`}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.name}>{name}</span>
          <span className={`${styles.diff} ${styles[`diff_${color}`]}`}>{diff}</span>
        </div>
      </div>

      <div className={styles.platform}>
        <span className={styles.platformDot} style={{ background: PLATFORM_COLOR[platform] }} />
        {platform} · {category}
        {date && <span className={styles.date}>{date}</span>}
      </div>

      <div className={styles.tags}>
        {tags.map(t => (
          <span key={t} className={styles.tag}>{t}</span>
        ))}
      </div>

      <div className={styles.readMore}>view writeup →</div>
    </Link>
  );
}
