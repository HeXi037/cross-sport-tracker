'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { currentUsername, isAdmin, logout } from '../lib/api';
import { ensureTrailingSlash } from '../lib/routes';
import { rememberLoginRedirect } from '../lib/loginRedirect';
import NotificationBell from '../components/NotificationBell';
import LanguageSelector from '../components/LanguageSelector';
import { useTranslations } from 'next-intl';
import { useTheme } from '../components/ThemeProvider';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const commonT = useTranslations('Common');
  const headerT = useTranslations('Header');

  const normalizedPathname = useMemo(
    () => ensureTrailingSlash(pathname ?? '/'),
    [pathname]
  );
  const { theme, toggleTheme } = useTheme();

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
        aria-label={commonT('nav.toggle')}
        aria-expanded={open}
        aria-controls="nav-menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        ☰
      </button>
      <nav id="nav-menu" className={`nav-links ${open ? 'open' : ''}`}>
        <ul>
          <li>
            <button
              type="button"
              className="nav-theme-toggle__button"
              onClick={() => {
                toggleTheme();
                setOpen(false);
              }}
              aria-pressed={theme === 'dark'}
              aria-label={
                theme === 'dark'
                  ? headerT('theme.switchToLight')
                  : headerT('theme.switchToDark')
              }
            >
              <span aria-hidden="true" className="nav-theme-toggle__icon">
                {theme === 'dark' ? '🌙' : '☀️'}
              </span>
              <span className="nav-theme-toggle__text">
                {theme === 'dark'
                  ? headerT('theme.dark')
                  : headerT('theme.light')}
              </span>
            </button>
          </li>
          <li className="nav-language-item">
            <LanguageSelector />
          </li>
          <li>
            <Link
              href="/"
              className={linkClassName('/')}
              aria-current={linkAriaCurrent('/')}
              onClick={() => setOpen(false)}
            >
              {headerT('links.home')}
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/players')}
              className={linkClassName('/players')}
              aria-current={linkAriaCurrent('/players')}
              onClick={() => setOpen(false)}
            >
              {headerT('links.players')}
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/matches')}
              className={linkClassName('/matches')}
              aria-current={linkAriaCurrent('/matches')}
              onClick={() => setOpen(false)}
            >
              {headerT('links.matches')}
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/record')}
              className={linkClassName('/record')}
              aria-current={linkAriaCurrent('/record')}
              onClick={() => setOpen(false)}
            >
              {headerT('links.record')}
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/tournaments')}
              className={linkClassName('/tournaments')}
              aria-current={linkAriaCurrent('/tournaments')}
              onClick={() => setOpen(false)}
            >
              {headerT('links.tournaments')}
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/leaderboard?sport=all')}
              className={linkClassName('/leaderboard')}
              aria-current={linkAriaCurrent('/leaderboard')}
              onClick={() => setOpen(false)}
            >
              {headerT('links.leaderboards')}
            </Link>
          </li>
          <li>
            <Link
              href={ensureTrailingSlash('/demo')}
              className={`${linkClassName('/demo')} nav-link--quiet`}
              aria-current={linkAriaCurrent('/demo')}
              onClick={() => setOpen(false)}
            >
              {headerT('links.demo')}
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
                  {headerT('links.adminMatches')}
                </Link>
              </li>
              <li>
                <Link
                  href={ensureTrailingSlash('/admin/match-history')}
                  className={linkClassName('/admin/match-history')}
                  aria-current={linkAriaCurrent('/admin/match-history')}
                  onClick={() => setOpen(false)}
                >
                  {headerT('links.adminMatchHistory')}
                </Link>
              </li>
              <li>
                <Link
                  href={ensureTrailingSlash('/admin/clubs')}
                  className={linkClassName('/admin/clubs')}
                  aria-current={linkAriaCurrent('/admin/clubs')}
                  onClick={() => setOpen(false)}
                >
                  {headerT('links.adminClubs')}
                </Link>
              </li>
              <li>
                <Link
                  href={ensureTrailingSlash('/admin/badges')}
                  className={linkClassName('/admin/badges')}
                  aria-current={linkAriaCurrent('/admin/badges')}
                  onClick={() => setOpen(false)}
                >
                  {headerT('links.adminBadges')}
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
                  {headerT('links.profile')}
                </Link>
              </li>
              <li>
                <NotificationBell />
              </li>
              <li className="user-status">
                {commonT('nav.loggedInAs', { username: user })}
              </li>
              <li>
                <button onClick={handleLogout}>{headerT('actions.logout')}</button>
              </li>
            </>
          ) : (
            <li>
              <Link
                href={ensureTrailingSlash('/login')}
                className={linkClassName('/login')}
                aria-current={linkAriaCurrent('/login')}
                onClick={() => {
                  rememberLoginRedirect();
                  setOpen(false);
                }}
              >
                {headerT('links.login')}
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
