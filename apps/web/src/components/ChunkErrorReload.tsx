"use client";

import { useEffect } from "react";

const RELOAD_KEY = "chunk-error-reload-ts";
const RELOAD_WINDOW_MS = 5000;

function shouldReloadFromError(event: ErrorEvent): boolean {
  if (!event) return false;
  const { message, filename, error, target } = event;
  if (error && typeof error === "object" && (error as Error).name === "ChunkLoadError") {
    return true;
  }
  if (typeof message === "string" && message.includes("ChunkLoadError")) {
    return true;
  }
  if (typeof filename === "string" && filename.includes("/_next/static/chunks/")) {
    return true;
  }
  if (target && (target as HTMLElement).tagName === "SCRIPT") {
    const src = (target as HTMLScriptElement).src;
    if (src && src.includes("/_next/static/chunks/")) {
      return true;
    }
  }
  return false;
}

function shouldReloadFromRejection(event: PromiseRejectionEvent): boolean {
  if (!event) return false;
  const { reason } = event;
  if (!reason) return false;
  if (typeof reason === "object" && "name" in reason && (reason as { name?: string }).name === "ChunkLoadError") {
    return true;
  }
  if (typeof reason === "string" && reason.includes("ChunkLoadError")) {
    return true;
  }
  return false;
}

function reloadOnce() {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const last = window.sessionStorage.getItem(RELOAD_KEY);
    if (last && now - Number(last) < RELOAD_WINDOW_MS) {
      return;
    }
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Access to sessionStorage can fail in private browsing modes; ignore
  }
  window.location.reload();
}

export default function ChunkErrorReload() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (shouldReloadFromError(event)) {
        reloadOnce();
      }
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (shouldReloadFromRejection(event)) {
        reloadOnce();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
