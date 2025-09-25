"use client";

import { useRouter } from "next/navigation";
import { ensureTrailingSlash } from "../../lib/routes";

interface PagerProps {
  limit: number;
  prevOffset: number;
  nextOffset: number;
  disablePrev: boolean;
  disableNext: boolean;
}

export default function Pager({
  limit,
  prevOffset,
  nextOffset,
  disablePrev,
  disableNext,
}: PagerProps) {
  const router = useRouter();
  const basePath = ensureTrailingSlash('/matches');

  return (
    <div className="pager">
      <button
        type="button"
        className="button"
        disabled={disablePrev}
        onClick={() =>
          router.push(`${basePath}?limit=${limit}&offset=${prevOffset}`)
        }
      >
        Previous
      </button>
      <button
        type="button"
        className="button"
        disabled={disableNext}
        onClick={() =>
          router.push(`${basePath}?limit=${limit}&offset=${nextOffset}`)
        }
      >
        Next
      </button>
    </div>
  );
}

