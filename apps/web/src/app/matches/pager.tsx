"use client";

import { useRouter } from "next/navigation";
import { ensureTrailingSlash } from "../../lib/routes";

interface PagerProps {
  limit: number;
  offset: number;
  itemCount: number;
  totalCount: number | null;
  prevOffset: number;
  nextOffset: number | null;
  disablePrev: boolean;
  disableNext: boolean;
}

export default function Pager({
  limit,
  offset,
  itemCount,
  totalCount,
  prevOffset,
  nextOffset,
  disablePrev,
  disableNext,
}: PagerProps) {
  const router = useRouter();
  const basePath = ensureTrailingSlash('/matches');

  const pageNumber = Math.floor(offset / limit) + 1;
  const totalKnown =
    typeof totalCount === 'number' && Number.isFinite(totalCount);

  let statusText: string;
  if (itemCount <= 0) {
    statusText = `Page ${pageNumber} · No matches on this page`;
  } else {
    const start = offset + 1;
    const end = offset + itemCount;
    statusText = `Page ${pageNumber} · Showing matches ${start}-${end}`;
    if (totalKnown) {
      statusText += ` of ${totalCount}`;
    }
  }

  const handlePrev = () => {
    if (disablePrev) return;
    router.push(`${basePath}?limit=${limit}&offset=${prevOffset}`);
  };

  const handleNext = () => {
    if (disableNext || nextOffset == null) return;
    router.push(`${basePath}?limit=${limit}&offset=${nextOffset}`);
  };

  return (
    <div className="pager" role="navigation" aria-label="Matches pagination">
      <p className="pager__status" aria-live="polite">
        {statusText}
      </p>
      <div className="pager__controls">
        <button
          type="button"
          className="button"
          disabled={disablePrev}
          onClick={handlePrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="button"
          disabled={disableNext}
          onClick={handleNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

