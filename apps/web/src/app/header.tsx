'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [open, setOpen] = useState(false);
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
        </ul>
      </nav>
    </header>
  );
}
