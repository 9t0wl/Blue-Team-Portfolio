import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './Nav.module.css';

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  const links = [
  { to: '/Blue-Team-Portfolio/#certs', label: 'certs' },
  { to: '/Blue-Team-Portfolio/#cases', label: 'cases' },
  { to: '/Blue-Team-Portfolio/#tools', label: 'tools' },
  { to: 'https://9t0wl.github.io/blue-team-cheatsheet/', label: 'cheatsheet', external: true },
  { to: '/Blue-Team-Portfolio/#contact', label: 'contact' },
  ];

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ''}`}>
      <Link to="/" className={styles.logo}>
        <span className={styles.logoNum}>9</span>t0wl
      </Link>

      <ul className={`${styles.links} ${menuOpen ? styles.open : ''}`}>
        {links.map(l => (
          <li key={l.to}>
            <a
              href={l.to}
              className={styles.link}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <span className={styles.slash}>./</span>{l.label}
            </a>
          </li>
        ))}
      </ul>

      <button
        className={styles.burger}
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Toggle menu"
      >
        <span /><span /><span />
      </button>
    </nav>
  );
}
