"use client";

import React from "react";
import { useRouter } from "next/navigation";

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
  return (
    <div className="pager">
      <button
        type="button"
        className="button"
        disabled={disablePrev}
        onClick={() => router.push(`/matches?limit=${limit}&offset=${prevOffset}`)}
      >
        Previous
      </button>
      <button
        type="button"
        className="button"
        disabled={disableNext}
        onClick={() => router.push(`/matches?limit=${limit}&offset=${nextOffset}`)}
      >
        Next
      </button>
    </div>
  );
}

