"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, currentUsername, logout } from "../../lib/api";

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
    try {
      const res = await apiFetch("/v0/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUser, password: newPass }),
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
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Login</button>
      </form>
      <p>
        <a href="/reset-password/request">Forgot password?</a>
      </p>

      <h2 className="heading">Sign Up</h2>
      <form onSubmit={handleSignup} className="auth-form">
        <input
          type="text"
          placeholder="Username"
          value={newUser}
          onChange={(e) => setNewUser(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
        />
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
