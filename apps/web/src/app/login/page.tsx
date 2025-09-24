"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  currentUsername,
  logout,
  persistSession,
} from "../../lib/api";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_.-]+$/;

const SIGNUP_ERROR_DETAILS: Record<string, string> = {
  "username exists": "That username is already in use.",
  "player exists": "That player already has an account.",
  "invalid admin secret": "Invalid admin secret provided.",
  "too many requests": "Too many signup attempts. Please try again later.",
};

function normalizeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const cleaned = err.message.replace(/^HTTP \d+:\s*/, "").trim();
    return cleaned.length > 0 ? cleaned : fallback;
  }
  return fallback;
}

function humanizeSignupDetail(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Unknown signup error.";
  }
  const mapped = SIGNUP_ERROR_DETAILS[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

async function extractSignupErrors(response: Response): Promise<string[]> {
  try {
    const data = await response.clone().json();
    const messages: string[] = [];
    if (typeof data === "string") {
      if (data.trim().length > 0) {
        messages.push(humanizeSignupDetail(data));
      }
    } else if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === "string" && item.trim().length > 0) {
          messages.push(humanizeSignupDetail(item));
        } else if (item && typeof item === "object") {
          const msg = (item as Record<string, unknown>).msg;
          if (typeof msg === "string" && msg.trim().length > 0) {
            messages.push(humanizeSignupDetail(msg));
          }
        }
      }
    } else if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const detail = record.detail;
      if (typeof detail === "string") {
        messages.push(humanizeSignupDetail(detail));
      } else if (Array.isArray(detail)) {
        for (const item of detail) {
          if (typeof item === "string" && item.trim().length > 0) {
            messages.push(humanizeSignupDetail(item));
          } else if (item && typeof item === "object") {
            const msg = (item as Record<string, unknown>).msg;
            if (typeof msg === "string" && msg.trim().length > 0) {
              messages.push(humanizeSignupDetail(msg));
            }
          }
        }
      } else if (detail && typeof detail === "object") {
        const msg = (detail as Record<string, unknown>).msg;
        if (typeof msg === "string" && msg.trim().length > 0) {
          messages.push(humanizeSignupDetail(msg));
        }
      }

      const fallbackFields: Array<[unknown, boolean]> = [
        [record.message, typeof record.message === "string"],
        [record.title, typeof record.title === "string"],
        [record.error, typeof record.error === "string"],
      ];
      for (const [value, isString] of fallbackFields) {
        if (isString) {
          const text = (value as string).trim();
          if (text.length > 0) {
            messages.push(humanizeSignupDetail(text));
          }
        }
      }
    }
    if (messages.length > 0) {
      return messages;
    }
  } catch {
    // Ignore JSON parsing errors and fall back to reading text.
  }

  try {
    const text = (await response.text()).trim();
    if (text.length > 0) {
      return [humanizeSignupDetail(text)];
    }
  } catch {
    // Ignore body read errors and fall back to generic message.
  }

  return ["Signup failed. Please try again."];
}

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState(currentUsername());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSignupMessage(null);
    try {
      const res = await apiFetch("/v0/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        persistSession(data);
        router.push("/");
      } else {
        setErrors(["Login failed. Please check your username and password."]); 
      }
    } catch (err) {
      setErrors([normalizeErrorMessage(err, "Login failed. Please try again.")]);
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSignupMessage(null);
    const trimmedUser = newUser.trim();
    const validationErrors: string[] = [];

    if (trimmedUser.length < 3) {
      validationErrors.push("Username must be at least 3 characters long.");
    }
    if (trimmedUser.length > 50) {
      validationErrors.push("Username must be 50 characters or fewer.");
    }
    if (
      trimmedUser.length >= 3 &&
      trimmedUser.length <= 50 &&
      !EMAIL_REGEX.test(trimmedUser) &&
      !USERNAME_REGEX.test(trimmedUser)
    ) {
      validationErrors.push(
        "Username must be a valid email address or contain only letters, numbers, underscores, hyphens, and periods.",
      );
    }
    if (newPass.length < 12 || !PASSWORD_REGEX.test(newPass)) {
      validationErrors.push(
        "Password must be at least 12 characters and include letters, numbers, and symbols.",
      );
    }
    if (newPass !== confirmPass) {
      validationErrors.push("Password and confirmation must match.");
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setNewUser(trimmedUser);
    try {
      const res = await apiFetch("/v0/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUser, password: newPass }),
      });
      if (res.ok) {
        const data = await res.json();
        persistSession(data);
        setSignupMessage("Account created successfully! Redirecting...");
        setErrors([]);
        setNewPass("");
        setConfirmPass("");
        router.push("/");
      } else {
        const messages = await extractSignupErrors(res);
        const contextualized = messages.map((msg) =>
          msg.toLowerCase().startsWith("signup") ? msg : `Signup failed: ${msg}`
        );
        setErrors(contextualized);
      }
    } catch (err) {
      setErrors([normalizeErrorMessage(err, "Signup failed. Please try again.")]);
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
        <div className="form-field">
          <label htmlFor="signup-confirm-password" className="form-label">
            Confirm Password
          </label>
          <input
            id="signup-confirm-password"
            type="password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button type="submit">Sign Up</button>
      </form>

      {signupMessage && (
        <div role="status" className="success">
          {signupMessage}
        </div>
      )}

      {errors.length > 0 && (
        <div role="alert" className="error">
          <ul>
            {errors.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
