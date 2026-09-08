import { useEffect, useState } from 'react';

/**
 * Tracks which section is currently under the reading line (40% down the
 * viewport). Shared by the nav and the scroll HUD so the two can never
 * disagree about where you are.
 *
 * Returns { active, progress } — progress is 0→1 down the whole document.
 */
export default function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;

    const measure = () => {
      raf = 0;

      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);

      const line = window.innerHeight * 0.4;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }

      // Bottom of the page: the last section is often too short to ever cross
      // the reading line, so claim it explicitly once we're at the end.
      if (scrollable > 0 && window.scrollY >= scrollable - 4) current = ids[ids.length - 1];

      setActive(current);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);

  return { active, progress };
}
