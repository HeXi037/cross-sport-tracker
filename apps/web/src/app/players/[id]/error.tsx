'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function PlayerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Player detail page crashed', error);
  }, [error]);

  return (
    <main className="container">
      <h1 className="heading">Player unavailable</h1>
      <p className="mt-2 text-red-600" role="alert">
        We couldn't load this player's details right now. Please refresh the
        page or try again later. If the problem continues, return to the
        players list.
      </p>
      <div className="mt-4 flex flex-col items-start gap-3 md:flex-row md:items-center">
        <button
          type="button"
          onClick={reset}
          className="button"
        >
          Try again
        </button>
        <Link href="/players" className="underline">
          Back to players
        </Link>
      </div>
    </main>
  );
}
