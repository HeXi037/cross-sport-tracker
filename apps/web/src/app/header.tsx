'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { currentUsername, isAdmin, logout } from '../lib/api';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const router = useRouter();

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
            <Link href="/" onClick={() => setOpen(false)}>
              Home
            </Link>
          </li>
          <li>
            <Link href="/players" onClick={() => setOpen(false)}>
              Players
            </Link>
          </li>
          <li>
            <Link href="/matches" onClick={() => setOpen(false)}>
              Matches
            </Link>
          </li>
          <li>
            <Link href="/record" onClick={() => setOpen(false)}>
              Record
            </Link>
          </li>
          <li>
            <Link href="/leaderboard" onClick={() => setOpen(false)}>
              Leaderboard
            </Link>
          </li>
          <li>
            <Link href="/leaderboard/master" onClick={() => setOpen(false)}>
              All Sports
            </Link>
          </li>
          {admin && (
            <>
              <li>
                <Link href="/admin/matches" onClick={() => setOpen(false)}>
                  Admin Matches
                </Link>
              </li>
              <li>
                <Link href="/admin/badges" onClick={() => setOpen(false)}>
                  Admin Badges
                </Link>
              </li>
            </>
          )}
          {user ? (
            <>
              <li>
                <Link href="/profile" onClick={() => setOpen(false)}>
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
              <Link href="/login" onClick={() => setOpen(false)}>
                Login
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
