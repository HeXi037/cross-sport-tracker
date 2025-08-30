// apps/web/src/app/layout.tsx
import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'cross-sport-tracker',
  description: 'Padel + Bowling MVP',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header style={{ backgroundColor: '#f5f5f5', padding: '1rem' }}>
          <nav>
            <ul
              style={{
                display: 'flex',
                gap: '1rem',
                listStyle: 'none',
                margin: 0,
                padding: 0,
              }}
            >
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
