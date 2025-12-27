"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  isLoggedIn,
  mustChangePasswordRequired,
  persistSession,
  updateMe,
} from "../../lib/api";
import { rememberLoginRedirect } from "../../lib/loginRedirect";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_GUIDELINES,
} from "../../lib/passwordGuidelines";
import ToastProvider, { useToast } from "../../components/ToastProvider";

function formatError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return "We couldn't update your password right now. Please try again.";
}

type Strength = "weak" | "okay" | "strong";

function evaluateStrength(password: string): Strength {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score += 1;
  if (score >= 3 && password.length >= MIN_PASSWORD_LENGTH + 4) return "strong";
  if (score >= 2) return "okay";
  return "weak";
}

function strengthLabel(strength: Strength): string {
  switch (strength) {
    case "strong":
      return "Strong";
    case "okay":
      return "Okay";
    default:
      return "Weak";
  }
}

function SetPasswordContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      rememberLoginRedirect("/set-password");
      router.replace("/login");
      return;
    }

    if (!mustChangePasswordRequired()) {
      setMustChange(false);
      setReady(true);
      router.replace("/");
      return;
    }

    setMustChange(true);
    setReady(true);
  }, [router]);

  const strength = useMemo(() => evaluateStrength(password), [password]);
  const passwordsMatch = password === confirmPassword;
  const meetsRules = password.trim().length >= MIN_PASSWORD_LENGTH;
  const canSubmit =
    meetsRules && passwordsMatch && password.length > 0 && !submitting && mustChange;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!meetsRules) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (password.trim() !== password) {
      setError("Password cannot start or end with spaces.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await updateMe({ password });
      persistSession();
      showToast({ message: "Your password has been updated.", variant: "success" });
      router.replace("/");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return null;
  }

  if (!mustChange) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <h1 className="heading">Your password has already been updated.</h1>
          <p className="text-muted">
            You can continue to your dashboard without changing it again.
          </p>
          <div className="auth-panel__actions">
            <button className="button" type="button" onClick={() => router.replace("/")}>
              Go to home
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-panel__header">
          <div>
            <p className="section-eyebrow">Security</p>
            <h1 className="heading">Set a new password</h1>
            <p className="text-muted">
              You’ve logged in with a temporary password. For security, please set a
              new one.
            </p>
          </div>
        </div>

        <form className="auth-panel__form" onSubmit={handleSubmit}>
          {error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="form-field">
            <div className="form-label-row">
              <label className="form-label" htmlFor="new-password">
                New password
              </label>
              <button
                type="button"
                className="link-button"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
              autoComplete="new-password"
            />
            <div className="password-strength" aria-live="polite">
              <div className={`password-strength__bar password-strength__bar--${strength}`}>
                <span className="password-strength__fill" />
              </div>
              <span className="password-strength__label">{strengthLabel(strength)}</span>
            </div>
            <p className="form-helper">
              At least 8 characters. Use a mix of letters, numbers, and symbols.
            </p>
          </div>

          <div className="form-field">
            <div className="form-label-row">
              <label className="form-label" htmlFor="confirm-password">
                Confirm new password
              </label>
              <button
                type="button"
                className="link-button"
                onClick={() => setShowConfirm((prev) => !prev)}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="confirm-password"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
              autoComplete="new-password"
              aria-invalid={!passwordsMatch}
            />
            {!passwordsMatch ? (
              <p className="auth-form__error" role="alert">
                Passwords don’t match.
              </p>
            ) : null}
          </div>

          <div className="password-requirements">
            <p className="text-muted">Your password should include:</p>
            <ul>
              {PASSWORD_GUIDELINES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <button className="button" type="submit" disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save new password"}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => router.replace("/login")}
          >
            Log out instead
          </button>
        </form>
      </section>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <ToastProvider>
      <SetPasswordContent />
    </ToastProvider>
  );
}
