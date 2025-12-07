"use client";

import { useEffect, useState, type FormEvent } from "react";
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

function formatError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return "We couldn't update your password. Please try again.";
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      rememberLoginRedirect("/set-password");
      router.replace("/login");
      return;
    }
    if (!mustChangePasswordRequired()) {
      router.replace("/");
      return;
    }
    setReady(true);
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmed = password.trim();
    if (trimmed.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (trimmed !== password) {
      setError("Password cannot start or end with spaces.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await updateMe({ password });
      if (response.access_token || response.refresh_token) {
        persistSession(response);
      }
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

  return (
    <main className="container">
      <h1 className="heading">Set a new password</h1>
      <p className="text-muted">
        Your password was reset by an administrator. Please choose a new one to
        continue using your account.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <label className="form-field" htmlFor="new-password">
          <span className="form-label">New password</span>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </label>

        <label className="form-field" htmlFor="confirm-password">
          <span className="form-label">Confirm new password</span>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </label>

        <div className="password-guidelines">
          <p className="text-muted">Your password should include:</p>
          <ul>
            {PASSWORD_GUIDELINES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save new password"}
        </button>
      </form>
    </main>
  );
}
