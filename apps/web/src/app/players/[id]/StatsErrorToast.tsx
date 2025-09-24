"use client";

import { useEffect, useRef } from "react";
import { useToast } from "../../../components/ToastProvider";

interface StatsErrorToastProps {
  show: boolean;
}

export default function StatsErrorToast({ show }: StatsErrorToastProps) {
  const { showToast } = useToast();
  const previous = useRef(false);

  useEffect(() => {
    if (show && !previous.current) {
      showToast({
        message: "We couldn't load this player's stats right now.",
        type: "error",
      });
    }
    previous.current = show;
  }, [show, showToast]);

  return null;
}
