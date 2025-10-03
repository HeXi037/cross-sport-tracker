'use client';

import Link from "next/link";

interface NoMatchesGuidanceProps {
  className?: string;
}

export default function NoMatchesGuidance({
  className,
}: NoMatchesGuidanceProps) {
  const classes = ["text-gray-600", className].filter(Boolean).join(" ") || undefined;

  return (
    <p className={classes}>
      No matches yet. {" "}
      <Link className="underline" href="/record">
        Record a match
      </Link>{" "}
      to see timeline and summaries.
    </p>
  );
}
