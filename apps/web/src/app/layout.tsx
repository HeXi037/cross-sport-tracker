// apps/web/src/app/layout.tsx
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
