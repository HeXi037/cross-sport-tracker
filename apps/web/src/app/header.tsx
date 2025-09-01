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
        onClick={() => setOpen((prev) => !prev)}
      >
        ☰
      </button>
      <nav className={`nav-links ${open ? 'open' : ''}`}>
        <ul>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/players">Players</Link>
          </li>
          <li>
            <Link href="/matches">Matches</Link>
          </li>
          <li>
            <Link href="/record">Record</Link>
          </li>
          <li>
            <Link href="/leaderboard">Leaderboard</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
