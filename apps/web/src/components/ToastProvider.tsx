"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "info" | "error" | "success";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface Toast extends Required<Omit<ToastOptions, "duration">> {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timeout = timers.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    ({ message, variant = "info", duration = 5000 }: ToastOptions) => {
      if (!message) return;
      setToasts((current) => {
        const id = Date.now() + Math.random();
        const nextToast: Toast = { id, message, variant };
        const nextState = [...current, nextToast];
        if (duration > 0) {
          const timeout = setTimeout(() => removeToast(id), duration);
          timers.current.set(id, timeout);
        }
        return nextState;
      });
    },
    [removeToast]
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timeout) => clearTimeout(timeout));
      timers.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="assertive" role="status">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.variant}`}
            data-testid="toast"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
