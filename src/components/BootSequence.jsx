import { useCallback, useEffect, useRef, useState } from 'react';
import { cases } from '../data/cases';
import { coverageStats } from '../data/attack';
import { BOOT_KEY, willBoot } from './bootState';
import styles from './BootSequence.module.css';

// Every figure here is read from the real data, so the opening can't drift
// out of sync with the lodge the way a hardcoded one would.
function buildLines() {
  const s = coverageStats();
  const embargoed = cases.filter((c) => /embargo/i.test(c.category)).length;

  const lines = [
    { k: 'cmd', t: './open --lodge 221b' },
    { k: 'ok', t: 'gas lamps lit', v: 'the study' },
    { k: 'ok', t: 'evidence vault unsealed', v: '/casebook' },
    { k: 'ok', t: 'index of methods consulted', v: `${s.techniqueCount} on record` },
    { k: 'ok', t: 'casebook opened', v: `${s.caseCount} investigations` },
    { k: 'ok', t: 'tactics charted', v: `${s.tacticsCovered} of ${s.tacticsTotal}` },
  ];

  if (embargoed) {
    lines.push({
      k: 'warn',
      t: `${embargoed} file${embargoed > 1 ? 's' : ''} withheld`,
      v: 'quarry still at large',
    });
  }

  lines.push({ k: 'ok', t: 'the game is afoot', v: 'read only' });
  lines.push({ k: 'done', t: 'enter the lodge' });
  return lines;
}

export default function BootSequence() {
  // Once per browser session, and never for reduced-motion users. Reading this
  // during the initial state means the overlay never flashes for repeat views.
  const [show, setShow] = useState(willBoot);
  const [n, setN] = useState(0);
  const [closing, setClosing] = useState(false);
  // Lazy initialiser: the line list is built once, not on every render.
  const [lines] = useState(buildLines);

  // Guards against the timer and a keypress both trying to close it.
  const closed = useRef(false);
  const finish = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    setClosing(true);
    document.documentElement.removeAttribute('data-booting');
    try { sessionStorage.setItem(BOOT_KEY, '1'); } catch { /* private mode — just don't persist */ }
    setTimeout(() => setShow(false), 420);
  }, []);

  useEffect(() => {
    if (!show) return;

    // Hold the page still underneath so the boot text isn't scrollable, and
    // flag the document so the hero pauses its entrance animation rather than
    // playing it out where nobody can see it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-booting', '');

    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);

    const step = setInterval(() => {
      setN((v) => {
        if (v >= lines.length) {
          clearInterval(step);
          setTimeout(finish, 420);
          return v;
        }
        return v + 1;
      });
    }, 135);

    return () => {
      clearInterval(step);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute('data-booting');
    };
  }, [show, lines.length, finish]);

  if (!show) return null;

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ''}`} role="status" aria-live="off">
      <div className={styles.term}>
        {lines.slice(0, n).map((l, i) => (
          <div key={i} className={styles.line}>
            {l.k === 'cmd' && (
              <>
                <span className={styles.prompt}>9t0wl@baker-street:~$</span>
                <span className={styles.cmd}>{l.t}</span>
              </>
            )}
            {(l.k === 'ok' || l.k === 'warn') && (
              <>
                <span className={l.k === 'ok' ? styles.ok : styles.warn}>
                  [{l.k === 'ok' ? ' LIT  ' : ' HELD '}]
                </span>
                <span className={styles.task}>{l.t}</span>
                <span className={styles.val}>{l.v}</span>
              </>
            )}
            {l.k === 'done' && (
              <span className={styles.done}>&#10022;&ensp;{l.t}<span className={styles.caret}>_</span></span>
            )}
          </div>
        ))}
      </div>
      <div className={styles.skip}>press any key to enter</div>
    </div>
  );
}
