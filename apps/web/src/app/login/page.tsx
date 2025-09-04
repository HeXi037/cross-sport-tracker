"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, currentUsername, logout } from "../../lib/api";
import InputField from "../../components/InputField";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState(currentUsername());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginErrors, setLoginErrors] = useState<{ username?: string; password?: string }>({});
  const [signupErrors, setSignupErrors] = useState<{ username?: string; password?: string }>({});

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: { username?: string; password?: string } = {};
    if (!username.trim()) errs.username = "Username required";
    if (!password.trim()) errs.password = "Password required";
    setLoginErrors(errs);
    if (Object.keys(errs).length) return;
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
    const errs: { username?: string; password?: string } = {};
    if (!newUser.trim()) errs.username = "Username required";
    if (!newPass.trim()) errs.password = "Password required";
    setSignupErrors(errs);
    if (Object.keys(errs).length) return;
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
        <InputField
          id="login-username"
          label="Username"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={loginErrors.username}
        />
        <InputField
          id="login-password"
          type="password"
          label="Password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={loginErrors.password}
        />
        <button type="submit">Login</button>
      </form>
      <p>
        <a href="/reset-password/request">Forgot password?</a>
      </p>

      <h2 className="heading">Sign Up</h2>
      <form onSubmit={handleSignup} className="auth-form">
        <InputField
          id="signup-username"
          label="Username"
          placeholder="Username"
          value={newUser}
          onChange={(e) => setNewUser(e.target.value)}
          error={signupErrors.username}
        />
        <InputField
          id="signup-password"
          type="password"
          label="Password"
          placeholder="Password"
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
          error={signupErrors.password}
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
