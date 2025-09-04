"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // TODO: send error to monitoring service
  }, [error]);

  return (
    <main className="container" style={{ padding: "2rem" }}>
      <h2>Something went wrong.</h2>
      <p>We're working to fix the issue. Please try again.</p>
      <button onClick={() => reset()}>Try again</button>
    </main>
  );
}

