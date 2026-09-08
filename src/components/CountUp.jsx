import { useEffect, useRef, useState } from 'react';

// '240+' -> ['', 240, '+'] · '100%' -> ['', 100, '%'] · '3yr' -> ['', 3, 'yr']
const parse = (v) => {
  const m = String(v).match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
  return m ? { pre: m[1], num: parseFloat(m[2]), post: m[3] } : null;
};

/** A stat that counts up the first time it scrolls into view. */
export default function CountUp({ value, duration = 1100, className, style }) {
  const parsed = parse(value);
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const hasNumber = parsed !== null;
  const target = parsed ? parsed.num : 0;
  const [n, setN] = useState(parsed && !reduced ? 0 : target);
  const ref = useRef(null);

  useEffect(() => {
    if (!hasNumber || reduced) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let start = 0;
    const run = (now) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / duration);
      // ease-out-cubic: fast off the line, settles onto the final number
      setN(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(run);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        raf = requestAnimationFrame(run);
        io.disconnect();
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [hasNumber, target, duration, reduced]);

  if (!parsed) return <span className={className} style={style}>{value}</span>;

  const shown = Number.isInteger(parsed.num) ? Math.round(n) : n.toFixed(1);
  return (
    <span ref={ref} className={className} style={style}>
      {parsed.pre}{shown}{parsed.post}
    </span>
  );
}
