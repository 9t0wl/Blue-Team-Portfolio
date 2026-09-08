export const BOOT_KEY = '9t0wl.booted';

/**
 * Whether the boot overlay is going to run on this page load — once per
 * browser session, and never for reduced-motion visitors.
 *
 * Lives outside BootSequence.jsx so the hero can ask the question without
 * importing a component (and so the file stays a clean component module for
 * fast refresh). Safe to call during render: it only reads.
 */
export function willBoot() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try { return !sessionStorage.getItem(BOOT_KEY); } catch { return false; }
}
