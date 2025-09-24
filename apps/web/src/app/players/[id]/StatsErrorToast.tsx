"use client";

import { useEffect, useRef } from "react";
import { useToast } from "../../../lib/toast";

const MESSAGE =
  "Player stats failed to load. Displayed records may be incomplete.";

export default function StatsErrorToast({ error }: { error: boolean }) {
  const { showToast } = useToast();
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (error) {
      if (!hasShownRef.current) {
        showToast(MESSAGE, { type: "error" });
      }
      hasShownRef.current = true;
    } else {
      hasShownRef.current = false;
    }
  }, [error, showToast]);

  return null;
}
