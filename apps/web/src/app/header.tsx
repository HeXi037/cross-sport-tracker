'use client';

import Link from 'next/link';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SESSION_CHANGED_EVENT, SESSION_ENDED_EVENT, currentUsername, isAdmin, logout } from '../lib/api';
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
    window.addEventListener(SESSION_CHANGED_EVENT, update);
    window.addEventListener(SESSION_ENDED_EVENT, update);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, update);
      window.removeEventListener(SESSION_ENDED_EVENT, update);
    };
  }, []);

  const handleLogout = () => {
    logout();
    setUser(null);
    setAdmin(false);
    setOpen(false);
    router.push('/');
  };

  const formatHref = (path: string) =>
    path.includes('?') ? path : ensureTrailingSlash(path);

  const handleNavClick = (href: string, onNavigate?: () => void) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onNavigate?.();
    setOpen(false);
    router.push(href);
  };

  const homeHref = formatHref('/');
  const playersHref = formatHref('/players');
  const matchesHref = formatHref('/matches');
  const recordHref = formatHref('/record');
  const tournamentsHref = formatHref('/tournaments');
  const leaderboardHref = formatHref('/leaderboard');
  const profileHref = formatHref('/profile');
  const loginHref = formatHref('/login');
  const adminMatchesHref = formatHref('/admin/matches');
  const adminMatchHistoryHref = formatHref('/admin/match-history');
  const adminUsersHref = formatHref('/admin/users');
  const adminClubsHref = formatHref('/admin/clubs');
  const adminBadgesHref = formatHref('/admin/badges');

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
              href={homeHref}
              className={linkClassName('/')}
              aria-current={linkAriaCurrent('/')}
              onClick={handleNavClick(homeHref)}
            >
              {headerT('links.home')}
            </Link>
          </li>
          <li>
            <Link
              href={playersHref}
              className={linkClassName('/players')}
              aria-current={linkAriaCurrent('/players')}
              onClick={handleNavClick(playersHref)}
            >
              {headerT('links.players')}
            </Link>
          </li>
          <li>
            <Link
              href={matchesHref}
              className={linkClassName('/matches')}
              aria-current={linkAriaCurrent('/matches')}
              onClick={handleNavClick(matchesHref)}
            >
              {headerT('links.matches')}
            </Link>
          </li>
          <li>
            <Link
              href={recordHref}
              className={linkClassName('/record')}
              aria-current={linkAriaCurrent('/record')}
              onClick={handleNavClick(recordHref)}
            >
              {headerT('links.record')}
            </Link>
          </li>
          <li>
            <Link
              href={tournamentsHref}
              className={linkClassName('/tournaments')}
              aria-current={linkAriaCurrent('/tournaments')}
              onClick={handleNavClick(tournamentsHref)}
            >
              {headerT('links.tournaments')}
            </Link>
          </li>
          <li>
            <Link
              href={leaderboardHref}
              className={linkClassName('/leaderboard')}
              aria-current={linkAriaCurrent('/leaderboard')}
              onClick={handleNavClick(leaderboardHref)}
            >
              {headerT('links.leaderboards')}
            </Link>
          </li>
          {admin && (
            <>
              <li>
                <Link
                  href={adminMatchesHref}
                  className={linkClassName('/admin/matches')}
                  aria-current={linkAriaCurrent('/admin/matches')}
                  onClick={handleNavClick(adminMatchesHref)}
                >
                  {headerT('links.adminMatches')}
                </Link>
              </li>
              <li>
                <Link
                  href={adminMatchHistoryHref}
                  className={linkClassName('/admin/match-history')}
                  aria-current={linkAriaCurrent('/admin/match-history')}
                  onClick={handleNavClick(adminMatchHistoryHref)}
                >
                  {headerT('links.adminMatchHistory')}
                </Link>
              </li>
              <li>
                <Link
                  href={adminUsersHref}
                  className={linkClassName('/admin/users')}
                  aria-current={linkAriaCurrent('/admin/users')}
                  onClick={handleNavClick(adminUsersHref)}
                >
                  {headerT('links.adminUsers')}
                </Link>
              </li>
              <li>
                <Link
                  href={adminClubsHref}
                  className={linkClassName('/admin/clubs')}
                  aria-current={linkAriaCurrent('/admin/clubs')}
                  onClick={handleNavClick(adminClubsHref)}
                >
                  {headerT('links.adminClubs')}
                </Link>
              </li>
              <li>
                <Link
                  href={adminBadgesHref}
                  className={linkClassName('/admin/badges')}
                  aria-current={linkAriaCurrent('/admin/badges')}
                  onClick={handleNavClick(adminBadgesHref)}
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
                  href={profileHref}
                  className={linkClassName('/profile')}
                  aria-current={linkAriaCurrent('/profile')}
                  onClick={handleNavClick(profileHref)}
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
                href={loginHref}
                className={linkClassName('/login')}
                aria-current={linkAriaCurrent('/login')}
                onClick={handleNavClick(loginHref, rememberLoginRedirect)}
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
