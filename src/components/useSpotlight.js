import { useEffect } from 'react';

/**
 * Feeds every [data-spot] card the cursor's position relative to itself, as
 * --mx / --my, so the HUD spotlight in global.css can follow the pointer.
 *
 * One delegated listener for the whole page rather than one per card — the
 * case grid alone can hold dozens of them.
 */
export default function useSpotlight() {
  useEffect(() => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return; // no hover on touch

    let raf = 0;
    let pending = null;

    const apply = () => {
      raf = 0;
      const { el, x, y } = pending;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${x - r.left}px`);
      el.style.setProperty('--my', `${y - r.top}px`);
    };

    const onMove = (e) => {
      const el = e.target instanceof Element ? e.target.closest('[data-spot]') : null;
      if (!el) return;
      pending = { el, x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
}
