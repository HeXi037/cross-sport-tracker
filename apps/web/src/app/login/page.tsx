"use client";

import { useMemo, useState, useId, type FormEvent } from "react";
import { zxcvbn } from "@zxcvbn-ts/core";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  currentUsername,
  logout,
  persistSession,
  type ApiError,
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

const LOGIN_ERROR_COPY: Record<string, string> = {
  auth_invalid_credentials: "Login failed. Please check your username and password.",
  auth_user_not_found: "Login failed. Please check your username and password.",
  auth_missing_token: "Your session expired. Please log in again.",
  auth_token_expired: "Your session expired. Please log in again.",
  auth_invalid_token: "We couldn't verify your session. Please log in again.",
};

function normalizeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const cleaned = err.message.replace(/^HTTP \d+:\s*/, "").trim();
    return cleaned.length > 0 ? cleaned : fallback;
  }
  return fallback;
}

function getLoginErrorMessage(err: unknown): string {
  const fallback = "Login failed. Please try again.";
  const apiError = err as ApiError | null;
  const code = typeof apiError?.code === "string" ? apiError.code : null;
  if (code) {
    const mapped = LOGIN_ERROR_COPY[code];
    if (mapped) {
      return mapped;
    }
    console.error(
      "Unhandled login error code",
      code,
      apiError?.parsedMessage ?? apiError?.message ?? null
    );
  } else if (apiError?.parsedMessage) {
    console.error("Unhandled login error message", apiError.parsedMessage);
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
  activeSegments: number;
}

function getPasswordStrength(password: string): PasswordStrengthResult {
  const trimmed = password.trim();
  const length = trimmed.length;
  const hasLetter = /[A-Za-z]/.test(trimmed);
  const hasNumber = /\d/.test(trimmed);
  const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);

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
      activeSegments: 0,
    };
  }

  const zxcvbnResult = zxcvbn(trimmed);
  const score = Math.min(Math.max(zxcvbnResult.score, 0), 4);
  const scoreDetails: Record<
    number,
    {
      label: string;
      helper: string;
      variant: PasswordStrengthResult["variant"];
      activeSegments: number;
    }
  > = {
    0: {
      label: "Too weak",
      helper: "Keep going – add more characters to strengthen your password.",
      variant: "weak",
      activeSegments: 1,
    },
    1: {
      label: "Weak",
      helper: "Add more unique characters and mix letters with numbers or symbols.",
      variant: "weak",
      activeSegments: 2,
    },
    2: {
      label: "Fair",
      helper: "Add a symbol or mix uppercase and lowercase letters for extra strength.",
      variant: "fair",
      activeSegments: 3,
    },
    3: {
      label: "Strong",
      helper: "Great! This password meets the recommended requirements.",
      variant: "strong",
      activeSegments: 4,
    },
    4: {
      label: "Very strong",
      helper: "Excellent! This password is very strong.",
      variant: "very-strong",
      activeSegments: 4,
    },
  };

  const detail = scoreDetails[score];
  const feedback =
    zxcvbnResult.feedback.warning || zxcvbnResult.feedback.suggestions?.[0] || "";
  const helper = feedback ? `${detail.helper} ${feedback}`.trim() : detail.helper;

  return {
    score,
    label: detail.label,
    helper,
    variant: detail.variant,
    checks,
    activeSegments: detail.activeSegments,
  };
}

async function extractLoginError(response: Response): Promise<string> {
  const fallback = "Login failed. Please check your username and password.";

  try {
    const data = await response.clone().json();
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed) {
        return trimmed;
      }
    } else if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const code = typeof record.code === "string" ? record.code : null;
      if (code) {
        const mapped = LOGIN_ERROR_COPY[code];
        if (mapped) {
          return mapped;
        }
      }
      const detail = typeof record.detail === "string" ? record.detail.trim() : "";
      if (detail) {
        return detail;
      }
      const message = typeof record.message === "string" ? record.message.trim() : "";
      if (message) {
        return message;
      }
      const error = typeof record.error === "string" ? record.error.trim() : "";
      if (error) {
        return error;
      }
    }
  } catch {
    // Ignore JSON parsing errors and fall back to reading text or default message.
  }

  try {
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
    // Ignore body read errors and fall back to generic message.
  }

  return fallback;
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
  const [loginErrors, setLoginErrors] = useState<string[]>([]);
  const [signupErrors, setSignupErrors] = useState<string[]>([]);
  const passwordStrengthLabelId = useId();
  const passwordStrengthHelperId = useId();
  const errorSummaryTitleId = useId();
  const loginErrorTitleId = useId();
  const signupErrorTitleId = useId();
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
    setLoginErrors([]);
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
        const message = await extractLoginError(res);
        setLoginErrors([message]);
      }
    } catch (err) {
      setLoginErrors([getLoginErrorMessage(err)]);
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setSignupErrors([]);
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
      setSignupErrors(validationErrors);
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
        setSignupErrors([]);
        setNewUser("");
        setNewPass("");
        setConfirmPass("");
        setUsername("");
        setPassword("");
        router.push("/");
      } else {
        const messages = await extractSignupErrors(res);
        setSignupErrors(messages);
      }
    } catch (err) {
      setSignupErrors([
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
      {(loginErrors.length > 0 || signupErrors.length > 0) && (
        <section
          className="auth-error-summary"
          role="alert"
          aria-labelledby={errorSummaryTitleId}
          aria-live="assertive"
        >
          <h2 id={errorSummaryTitleId}>There was a problem signing in</h2>
          {loginErrors.length > 0 && (
            <div className="auth-error-summary__group" aria-labelledby={loginErrorTitleId}>
              <h3 id={loginErrorTitleId}>Login</h3>
              <ul>
                {loginErrors.map((message, index) => (
                  <li key={`login-error-${index}`}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          {signupErrors.length > 0 && (
            <div className="auth-error-summary__group" aria-labelledby={signupErrorTitleId}>
              <h3 id={signupErrorTitleId}>Sign Up</h3>
              <ul>
                {signupErrors.map((message, index) => (
                  <li key={`signup-error-${index}`}>{message}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <form onSubmit={handleLogin} className="auth-form">
        {loginErrors.length > 0 && (
          <div className="auth-form__error" aria-live="polite">
            {loginErrors[0]}
          </div>
        )}
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
              className="password-strength__meter"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={passwordStrength.score}
              aria-describedby={`${passwordStrengthLabelId} ${passwordStrengthHelperId}`}
            >
              {Array.from({ length: 4 }, (_, index) => {
                const isActive = passwordStrength.activeSegments > index;
                const variantClass = isActive
                  ? ` password-strength__segment--${passwordStrength.variant}`
                  : "";
                const activeClass = isActive ? " password-strength__segment--active" : "";
                return (
                  <span
                    key={`password-strength-segment-${index}`}
                    className={`password-strength__segment${activeClass}${variantClass}`}
                    aria-hidden="true"
                  />
                );
              })}
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
        {signupErrors.length > 0 && (
          <div className="auth-form__error" aria-live="polite">
            Please review the issues listed above before continuing.
          </div>
        )}
        <button type="submit">Sign Up</button>
      </form>
    </main>
  );
}
