// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';

export const metadata = {
  title: 'cross-sport-tracker',
  description: 'Ongoing self-hosted project',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ChunkErrorReload />
        <Header />
        {children}
      </body>
    </html>
  );
}
