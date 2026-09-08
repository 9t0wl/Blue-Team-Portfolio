import { Link } from 'react-router-dom';
import { cases } from '../data/cases';
import styles from './CaseCard.module.css';

// The lodge grades its cases the way Holmes would have. The platform's own
// difficulty is still printed alongside it, so nobody has to decode the
// flavour to know what an HTB "very-easy" actually was.
const GRADE = {
  'very-easy': { word: 'Trivial',     tone: 'calm' },
  easy:        { word: 'Elementary',  tone: 'calm' },
  medium:      { word: 'Singular',    tone: 'warm' },
  hard:        { word: 'Grave',       tone: 'hot' },
  insane:      { word: 'Insoluble',   tone: 'hot' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June',
                'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

// '2026-09' -> 'Sept 2026'
function filedOn(date) {
  if (!date) return null;
  const [y, m] = date.split('-');
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${y}` : date;
}

export default function CaseCard({ entry }) {
  const { id, name, platform, category, diff, tags, date } = entry;
  const grade = GRADE[diff] || GRADE.medium;

  // Numbered by position in the casebook, not by position in the filtered
  // view, so a case keeps its number whatever filter is applied.
  const no = String(cases.findIndex((c) => c.id === id) + 1).padStart(4, '0');

  // Embargo is recorded in the category string; lift it out into a stamp
  // rather than leaving it buried in the subtitle.
  const embargoed = /embargo/i.test(category);
  const subject = category.split('·')[0].trim();

  return (
    <Link to={`/case/${id}`} className={`${styles.file} ${styles[grade.tone]}`} data-spot>
      <span className="hud" aria-hidden="true" />

      <div className={styles.spine}>
        <span className={styles.noLabel}>No.</span>
        <span className={styles.no}>{no}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.topLine}>
          <h3 className={styles.name}>{name}</h3>
          <span className={styles.grade}>
            {grade.word}
            <span className={styles.gradeRaw}>{diff}</span>
          </span>
        </div>

        <div className={styles.subject}>
          <span className={styles.platform}>{platform}</span>
          <span className={styles.dot}>&middot;</span>
          <span>{subject}</span>
          {date && (
            <>
              <span className={styles.dot}>&middot;</span>
              <span className={styles.filed}>Filed {filedOn(date)}</span>
            </>
          )}
          {embargoed && <span className={styles.stamp}>Embargoed</span>}
        </div>

        <div className={styles.traces}>
          {tags.map((t) => (
            <span key={t} className={styles.trace}>{t}</span>
          ))}
        </div>
      </div>

      <div className={styles.openFile}>
        <span className={styles.openText}>Open the file</span>
        <span className={styles.openArrow}>&rarr;</span>
      </div>
    </Link>
  );
}
