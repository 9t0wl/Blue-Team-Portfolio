import { useEffect, useRef } from 'react';

export default function useReveal() {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (!entry.isIntersecting) return;
          setTimeout(() => entry.target.classList.add('visible'), i * 80);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.08 }
    );

    // Pick up any .reveal we haven't already claimed. Idempotent, so it's safe
    // to call as often as we like.
    const scan = () => {
      root.querySelectorAll('.reveal:not([data-revealing])').forEach((el) => {
        el.dataset.revealing = '';
        io.observe(el);
      });
    };

    scan();

    // Filtering the case list swaps card nodes in and out well after mount. A
    // one-shot scan never sees those new nodes, so they keep .reveal (opacity 0)
    // and never animate in — the list looks empty even though it rendered.
    // Watching the subtree means anything added later gets observed too.
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return ref;
}
