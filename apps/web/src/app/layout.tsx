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
        <header className="nav">
          <nav>
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
