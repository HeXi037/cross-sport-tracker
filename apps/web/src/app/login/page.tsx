"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, currentUsername, logout } from "../../lib/api";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState(currentUsername());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch("/v0/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        window.localStorage.setItem("token", data.access_token);
        // The header listens for the `storage` event to refresh auth state,
        // but that event isn't emitted in the same tab that updates
        // localStorage.  Manually dispatch it so the header reflects the new
        // login immediately.
        window.dispatchEvent(new Event("storage"));
        router.push("/");
      } else {
        setError("Login failed");
      }
    } catch {
      setError("Login failed");
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedUser = newUser.trim();
    if (trimmedUser.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (newPass.length < 12 || !PASSWORD_REGEX.test(newPass)) {
      setError(
        "Password must be at least 12 characters and include letters, numbers, and symbols",
      );
      return;
    }
    try {
      const res = await apiFetch("/v0/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUser, password: newPass }),
      });
      if (res.ok) {
        const data = await res.json();
        window.localStorage.setItem("token", data.access_token);
        // Notify other components of the updated auth token.  Without this the
        // header will continue showing stale login state until a page reload.
        window.dispatchEvent(new Event("storage"));
        router.push("/");
      } else {
        setError("Signup failed");
      }
    } catch {
      setError("Signup failed");
    }
  };

  if (user) {
    return (
      <main className="container">
        <h1 className="heading">Logged in as {user}</h1>
        <button
          onClick={() => {
            logout();
            setUser(null);
          }}
        >
          Logout
        </button>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="heading">Login</h1>
      <form onSubmit={handleLogin} className="auth-form">
        <div className="form-field">
          <label htmlFor="login-username" className="form-label">
            Username
          </label>
          <input
            id="login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="login-password" className="form-label">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit">Login</button>
      </form>

      <h2 className="heading">Sign Up</h2>
      <form onSubmit={handleSignup} className="auth-form">
        <div className="form-field">
          <label htmlFor="signup-username" className="form-label">
            Username
          </label>
          <input
            id="signup-username"
            type="text"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="signup-password" className="form-label">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button type="submit">Sign Up</button>
      </form>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
