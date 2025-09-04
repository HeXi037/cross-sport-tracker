"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "../../lib/api";

export default function ResetConfirmPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch("/v0/auth/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        setError("Reset failed");
      }
    } catch {
      setError("Reset failed");
    }
  };

  return (
    <main className="container">
      <h1 className="heading">Set New Password</h1>
      {success ? (
        <p>
          Password updated. <a href="/login">Return to login</a>
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Reset Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <input
            type="password"
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Update Password</button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
