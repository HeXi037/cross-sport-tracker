"use client";

import { useEffect, useState } from "react";
import { currentUserId, isAdmin, isLoggedIn } from "./api";

export type SessionSnapshot = {
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId: string | null;
};

export function getSessionSnapshot(): SessionSnapshot {
  return {
    isAdmin: isAdmin(),
    isLoggedIn: isLoggedIn(),
    userId: currentUserId(),
  };
}

export function useSessionSnapshot(): SessionSnapshot {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => getSessionSnapshot());

  useEffect(() => {
    const handleStorage = () => {
      setSnapshot(getSessionSnapshot());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return snapshot;
}

