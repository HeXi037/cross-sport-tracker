"use client";

import { useEffect, useState } from "react";
import {
  currentUserId,
  isAdmin,
  isLoggedIn,
  SESSION_CHANGED_EVENT,
  SESSION_ENDED_EVENT,
} from "./api";

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
    const handleSessionChange = () => {
      setSnapshot(getSessionSnapshot());
    };
    window.addEventListener(SESSION_CHANGED_EVENT, handleSessionChange);
    window.addEventListener(SESSION_ENDED_EVENT, handleSessionChange);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, handleSessionChange);
      window.removeEventListener(SESSION_ENDED_EVENT, handleSessionChange);
    };
  }, []);

  return snapshot;
}
