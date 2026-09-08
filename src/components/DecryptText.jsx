import { useEffect, useRef, useState } from 'react';

const GLYPHS = '!<>-_/[]{}=+*^?#%&$01ABCDEF';
const rand = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/**
 * Text that resolves out of scrambled glyphs the first time it scrolls
 * into view.
 *
 * `parts` keeps the coloured spans intact: the whole thing scrambles as one
 * string, but renders back out sliced into its original segments, so
 * <DecryptText parts={[{t:'Case '},{t:'Files',c:'accent-pk'}]} /> still gets
 * its accent colour on "Files".
 */
export default function DecryptText({
  parts,
  as: Tag = 'span',
  className = '',
  speed = 34,     // ms per settled character
  delay = 0,
  ...rest
}) {
  const full = parts.map((p) => p.t).join('');
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const [out, setOut] = useState(reduced ? full : '');
  const ref = useRef(null);
  const done = useRef(reduced);

  useEffect(() => {
    if (done.current) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let start = 0;

    const tick = (now) => {
      if (!start) start = now;
      const elapsed = now - start - delay;

      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // How many characters have locked in so far.
      const settled = Math.floor(elapsed / speed);
      if (settled >= full.length) {
        setOut(full);
        done.current = true;
        return;
      }

      let s = '';
      for (let i = 0; i < full.length; i++) {
        const ch = full[i];
        if (i < settled || ch === ' ') s += ch;
        // a short scrambling front edge, then nothing — so the tail doesn't
        // sit there as a wall of noise for the whole animation
        else if (i < settled + 14) s += rand();
        else s += ' ';
      }
      setOut(s);
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || raf) return;
        raf = requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.2 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [full, speed, delay]);

  // Slice the (possibly scrambled) output back into the original segments so
  // colours stay put while the characters are still churning. Offsets are
  // derived rather than accumulated in a mutable cursor.
  const offsets = parts.map((_, i) =>
    parts.slice(0, i).reduce((sum, q) => sum + q.t.length, 0)
  );
  const rendered = parts.map((p, i) => {
    const slice = out.slice(offsets[i], offsets[i] + p.t.length);
    return (
      <span key={i} className={p.c}>{slice}</span>
    );
  });

  return (
    <Tag ref={ref} className={className} aria-label={full} {...rest}>
      <span aria-hidden="true">{rendered}</span>
    </Tag>
  );
}
