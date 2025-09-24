"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastType = "info" | "success" | "error";

export interface ShowToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface Toast extends Required<Omit<ShowToastOptions, "duration">> {
  id: number;
  duration: number;
}

interface ToastContextValue {
  showToast: (options: ShowToastOptions) => void;
  dismissToast: (id: number) => void;
}

const DEFAULT_DURATION = 5000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function normalizeDuration(duration: number | undefined): number {
  if (typeof duration !== "number") return DEFAULT_DURATION;
  if (!Number.isFinite(duration) || duration <= 0) return DEFAULT_DURATION;
  return duration;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timeoutId = timers.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    ({ message, type = "info", duration }: ShowToastOptions) => {
      if (!message) return;
      const toast: Toast = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        message,
        type,
        duration: normalizeDuration(duration),
      };
      setToasts((current) => [...current, toast]);

      const timeoutId = window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.duration);
      timers.current.set(toast.id, timeoutId);
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timers.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="assertive" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.type}`}
            role="status"
            aria-live="assertive"
          >
            <span className="toast__message">{toast.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
