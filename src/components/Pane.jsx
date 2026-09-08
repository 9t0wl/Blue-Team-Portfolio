import DecryptText from './DecryptText';
import styles from './Pane.module.css';

/**
 * A brass-framed section of the console. The header rail carries the chapter
 * mark, the engraved label and an optional reading on the right, so every
 * section reads as a instrument panel rather than a page heading.
 *
 * `titleParts` goes straight to DecryptText, e.g.
 *   [{ t: 'The ' }, { t: 'Casebook', c: 'accent-p' }]
 */
export default function Pane({ id, mark, label, meta, titleParts, blurb, children }) {
  return (
    <section id={id} className={styles.pane}>
      <div className={`${styles.rail} reveal`}>
        <span className={styles.mark}>{mark}</span>
        <span className={styles.label}>{label}</span>
        <span className={styles.railLine} />
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>

      <div className={`${styles.head} reveal`}>
        <DecryptText as="h2" className="section-title" parts={titleParts} />
        {blurb && <p className={styles.blurb}>{blurb}</p>}
        <div className="section-line" />
      </div>

      {children}
    </section>
  );
}
