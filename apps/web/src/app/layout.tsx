'use client';

// apps/web/src/app/layout.tsx
import './globals.css';
import Link from 'next/link';
import { useState } from 'react';

export const metadata = {
  title: 'cross-sport-tracker',
  description: 'Ongoing self-hosted project',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <html lang="en">
      <body>
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
        {children}
      </body>
    </html>
  );
}
