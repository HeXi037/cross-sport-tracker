"use client";

import { useEffect } from "react";
import Sentry from "../lib/monitoring";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="container" style={{ padding: "2rem" }}>
      <h2>Something went wrong.</h2>
      <p>We&apos;re working to fix the issue. Please try again.</p>
      <button onClick={() => reset()}>Try again</button>
    </main>
  );
}

