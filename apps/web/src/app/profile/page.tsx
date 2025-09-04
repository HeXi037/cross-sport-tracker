"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, currentUsername } from "../../lib/api";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/v0/auth/me").then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setUsername(data.username);
      } else if (res.status === 401) {
        router.push("/login");
      }
    });
  }, [router]);

  const validate = () => {
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      return false;
    }
    if (password && (password.length < 8 || !PASSWORD_REGEX.test(password))) {
      setError(
        "Password must be at least 8 characters and include letters, numbers, and symbols"
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validate()) return;
    const body: Record<string, string> = {};
    if (username) body.username = username;
    if (password) body.password = password;
    const res = await apiFetch("/v0/auth/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        window.localStorage.setItem("token", data.access_token);
        window.dispatchEvent(new Event("storage"));
      }
      setPassword("");
      setSuccess("Profile updated");
    } else {
      setError("Update failed");
    }
  };

  if (!currentUsername()) {
    return null; // render nothing while redirecting
  }

  return (
    <main className="container">
      <h1 className="heading">Profile</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="New Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Save</button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="success">
          {success}
        </p>
      )}
    </main>
  );
}

