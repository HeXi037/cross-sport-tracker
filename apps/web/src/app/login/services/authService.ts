import {
  apiFetch,
  persistSession,
  setSessionHintCookie,
  type ApiError,
  type TokenResponse,
} from "../../../lib/api";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_REGEX = /^[A-Za-z0-9_.-]+$/;

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

export class SignupError extends Error {
  constructor(public readonly messages: string[]) {
    super(messages.join("\n"));
    this.name = "SignupError";
  }
}

export function normalizeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const cleaned = err.message.replace(/^HTTP \d+:\s*/, "").trim();
    return cleaned.length > 0 ? cleaned : fallback;
  }
  return fallback;
}

export function getLoginErrorMessage(err: unknown): string {
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

export function humanizeSignupDetail(message: string): string {
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

export async function extractLoginError(response: Response): Promise<string> {
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

export async function extractSignupErrors(response: Response): Promise<string[]> {
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

export async function loginUser(
  username: string,
  password: string
): Promise<TokenResponse> {
  const res = await apiFetch("/v0/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const message = await extractLoginError(res);
    throw new Error(message);
  }

  const payload = ((await res.json()) as TokenResponse) ?? {};
  setSessionHintCookie(payload.sessionHint);
  persistSession();
  return { mustChangePassword: payload.mustChangePassword };
}

export async function signupUser(username: string, password: string) {
  const res = await apiFetch("/v0/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const messages = await extractSignupErrors(res);
    throw new SignupError(messages);
  }

  const payload = ((await res.json()) as TokenResponse) ?? {};
  setSessionHintCookie(payload.sessionHint);
  persistSession();
  return { mustChangePassword: payload.mustChangePassword };
}

export async function checkUsernameAvailability(
  username: string,
  signal?: AbortSignal
): Promise<boolean> {
  const res = await apiFetch(
    `/v0/auth/signup/username-availability?username=${encodeURIComponent(username)}`,
    { signal }
  );
  const data = (await res.json()) as { available?: boolean };
  return data?.available === true;
}
