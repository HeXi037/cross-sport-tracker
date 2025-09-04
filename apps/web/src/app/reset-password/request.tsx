"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "../../lib/api";

export default function ResetRequestPage() {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch("/v0/auth/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.reset_token);
      } else {
        setError("Request failed");
      }
    } catch {
      setError("Request failed");
    }
  };

  return (
    <main className="container">
      <h1 className="heading">Request Password Reset</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button type="submit">Request Reset</button>
      </form>
      {token && (
        <p>
          Your reset token: <code>{token}</code>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
