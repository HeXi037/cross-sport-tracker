'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { currentUsername, isAdmin, logout } from '../lib/api';
import { ensureTrailingSlash } from '../lib/routes';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const normalizedPathname = useMemo(
    () => ensureTrailingSlash(pathname ?? '/'),
    [pathname]
  );

  const isActivePath = (targetPath: string) => {
    const normalizedTarget = ensureTrailingSlash(targetPath);
    if (normalizedTarget === '/') {
      return normalizedPathname === '/';
    }
    return normalizedPathname.startsWith(normalizedTarget);
  };

  const linkClassName = (targetPath: string) =>
    `nav-link${isActivePath(targetPath) ? ' is-active' : ''}`;

  const linkAriaCurrent = (targetPath: string) =>
    isActivePath(targetPath) ? 'page' : undefined;

  useEffect(() => {
    const update = () => {
      setUser(currentUsername());
      setAdmin(isAdmin());
    };
    update();
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  const handleLogout = () => {
    logout();
    setUser(null);
    setAdmin(false);
    setOpen(false);
    router.push('/');
  };

  return (
    <header className="nav">
      <button
        className="hamburger"
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="nav-menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        ☰
      </button>
      <nav id="nav-menu" className={`nav-links ${open ? 'open' : ''}`}>
        <ul>
          <li>
            <Link
              href="/"
              className={linkClassName('/')}
              aria-current={linkAriaCurrent('/')}
              onClick={() => setOpen(false)}
            >
              Home
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/players')}
              className={linkClassName('/players')}
              aria-current={linkAriaCurrent('/players')}
              onClick={() => setOpen(false)}
            >
              Players
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/matches')}
              className={linkClassName('/matches')}
              aria-current={linkAriaCurrent('/matches')}
              onClick={() => setOpen(false)}
            >
              Matches
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/record')}
              className={linkClassName('/record')}
              aria-current={linkAriaCurrent('/record')}
              onClick={() => setOpen(false)}
            >
              Record
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/leaderboard?sport=all')}
              className={linkClassName('/leaderboard')}
              aria-current={linkAriaCurrent('/leaderboard')}
              onClick={() => setOpen(false)}
            >
              Leaderboards
            </Link>
          </li>
          {admin && (
            <>
              <li>
                <Link
                  href={ensureTrailingSlash('/admin/matches')}
                  className={linkClassName('/admin/matches')}
                  aria-current={linkAriaCurrent('/admin/matches')}
                  onClick={() => setOpen(false)}
                >
                  Admin Matches
                </Link>
              </li>
              <li>
                <Link
                  href={ensureTrailingSlash('/admin/badges')}
                  className={linkClassName('/admin/badges')}
                  aria-current={linkAriaCurrent('/admin/badges')}
                  onClick={() => setOpen(false)}
                >
                  Admin Badges
                </Link>
              </li>
            </>
          )}
          {user ? (
            <>
              <li>
                <Link
                  href={ensureTrailingSlash('/profile')}
                  className={linkClassName('/profile')}
                  aria-current={linkAriaCurrent('/profile')}
                  onClick={() => setOpen(false)}
                >
                  Profile
                </Link>
              </li>
              <li className="user-status">Logged in as {user}</li>
              <li>
                <button onClick={handleLogout}>Logout</button>
              </li>
            </>
          ) : (
            <li>
              <Link
                href={ensureTrailingSlash('/login')}
                className={linkClassName('/login')}
                aria-current={linkAriaCurrent('/login')}
                onClick={() => setOpen(false)}
              >
                Login
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
