"use client";

import { useMemo, useState, useId, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  currentUsername,
  logout,
  persistSession,
} from "../../lib/api";
import { useToast } from "../../components/ToastProvider";
import { useLocale } from "../../lib/LocaleContext";
import { getAuthCopy } from "../../lib/authCopy";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_.-]+$/;

const SIGNUP_ERROR_DETAILS: Record<string, string> = {
  "username exists": "Username already taken.",
  "username already exists": "Username already taken.",
  "username already taken": "Username already taken.",
  "user already exists": "Username already taken.",
  "email exists": "That email address is already registered.",
  "player exists": "This player already has an account.",
  "player already registered": "This player already has an account.",
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

interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

interface PasswordStrengthResult {
  score: number;
  label: string;
  helper: string;
  variant: "empty" | "weak" | "fair" | "strong" | "very-strong";
  checks: PasswordRequirement[];
}

function getPasswordStrength(password: string): PasswordStrengthResult {
  const trimmed = password.trim();
  const length = trimmed.length;
  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  const hasLetter = /[A-Za-z]/.test(trimmed);
  const hasNumber = /\d/.test(trimmed);
  const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);
  const hasMixedCase = hasLower && hasUpper;

  const checks: PasswordRequirement[] = [
    { id: "length", label: "At least 12 characters", met: length >= 12 },
    { id: "letter", label: "Includes a letter", met: hasLetter },
    { id: "number", label: "Includes a number", met: hasNumber },
    { id: "symbol", label: "Includes a symbol", met: hasSymbol },
  ];

  if (!trimmed) {
    return {
      score: 0,
      label: "Start typing a password",
      helper: "Use at least 12 characters with letters, numbers, and symbols.",
      variant: "empty",
      checks,
    };
  }

  let score = 0;
  if (length >= 8) {
    score = 1;
  }
  if (length >= 12 && hasLetter && hasNumber) {
    score = 2;
  }
  if (length >= 12 && hasLetter && hasNumber && hasSymbol) {
    score = 3;
  }
  if (length >= 16 && hasLetter && hasNumber && hasSymbol && hasMixedCase) {
    score = 4;
  }

  let label = "Too weak";
  let helper = "Use at least 12 characters with letters, numbers, and symbols.";
  let variant: PasswordStrengthResult["variant"] = "weak";

  switch (score) {
    case 0:
      label = "Too weak";
      helper = "Keep going – add more characters to strengthen your password.";
      variant = "weak";
      break;
    case 1:
      label = "Weak";
      helper = "Add more characters and mix in numbers and symbols.";
      variant = "weak";
      break;
    case 2:
      label = "Fair";
      helper = "Add a symbol or mix uppercase and lowercase letters for extra strength.";
      variant = "fair";
      break;
    case 3:
      label = "Strong";
      helper = "Great! This password meets the recommended requirements.";
      variant = "strong";
      break;
    default:
      label = "Very strong";
      helper = "Excellent! This password is very strong.";
      variant = "very-strong";
      break;
  }

  return { score, label, helper, variant, checks };
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

  return ["We couldn't create your account. Please try again."];
}

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const locale = useLocale();
  const [user, setUser] = useState(currentUsername());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const passwordStrengthLabelId = useId();
  const passwordStrengthHelperId = useId();
  const { usernameCharacterRule, usernameEmailOption } = useMemo(
    () => getAuthCopy(locale),
    [locale]
  );
  const usernameGuidelines = useMemo(
    () => [usernameCharacterRule, usernameEmailOption],
    [usernameCharacterRule, usernameEmailOption]
  );
  const passwordStrength = useMemo(
    () => getPasswordStrength(newPass),
    [newPass]
  );

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrors([]);
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
      validationErrors.push(usernameCharacterRule, usernameEmailOption);
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
        showToast({
          message: "Account created successfully!",
          variant: "success",
        });
        setErrors([]);
        setNewUser("");
        setNewPass("");
        setConfirmPass("");
        setUsername("");
        setPassword("");
        router.push("/");
      } else {
        const messages = await extractSignupErrors(res);
        setErrors(messages);
      }
    } catch (err) {
      setErrors([
        normalizeErrorMessage(
          err,
          "We couldn't create your account. Please try again."
        ),
      ]);
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
          <ul className="password-guidelines">
            {usernameGuidelines.map((guideline) => (
              <li key={guideline} className="password-guidelines__item">
                <span className="password-guidelines__status" aria-hidden="true">
                  •
                </span>
                {guideline}
              </li>
            ))}
          </ul>
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
          <div className="password-strength" aria-live="polite">
            <div
              className="password-strength__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={passwordStrength.score}
              aria-describedby={`${passwordStrengthLabelId} ${passwordStrengthHelperId}`}
            >
              <div
                className={`password-strength__bar password-strength__bar--${passwordStrength.variant}`}
                style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
              />
            </div>
            <div id={passwordStrengthLabelId} className="password-strength__label">
              Password strength: {passwordStrength.label}
            </div>
            <p id={passwordStrengthHelperId} className="password-strength__helper">
              {passwordStrength.helper}
            </p>
          </div>
          <ul className="password-guidelines">
            {passwordStrength.checks.map((check) => (
              <li
                key={check.id}
                className={`password-guidelines__item${
                  check.met ? " password-guidelines__item--met" : ""
                }`}
              >
                <span className="password-guidelines__status" aria-hidden="true">
                  {check.met ? "✓" : "•"}
                </span>
                {check.label}
              </li>
            ))}
          </ul>
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
