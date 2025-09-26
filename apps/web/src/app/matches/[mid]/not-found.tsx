import Link from "next/link";

import { ensureTrailingSlash } from "../../../lib/routes";

export default function MatchNotFound() {
  return (
    <main className="container">
      <div className="text-sm">
        <Link
          href={ensureTrailingSlash("/matches")}
          className="underline underline-offset-2"
        >
          ← Back to matches
        </Link>
      </div>
      <h1 className="heading mt-6">Match not found</h1>
      <p className="mt-2 text-slate-700 dark:text-slate-200">
        We couldn&apos;t find the match you were looking for. It may have been moved
        or no longer exists.
      </p>
      <Link
        href={ensureTrailingSlash("/matches")}
        className="button mt-4 inline-flex items-center"
      >
        Browse matches
      </Link>
    </main>
  );
}
