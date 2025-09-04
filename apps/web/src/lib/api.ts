// apps/web/src/lib/api.ts
export function apiBase(): string {
  const server = typeof window === 'undefined';
  const base = server
    ? process.env.INTERNAL_API_BASE_URL || 'http://localhost:8000/api'
    : process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function apiUrl(path: string): string {
  const b = apiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = await ensureAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    return await fetch(apiUrl(path), { ...init, headers, credentials: "include" });
  } catch (err) {
    console.error("API request failed", err);
    throw err;
  }
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  return atob(padded);
}

async function ensureAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  let token = window.localStorage?.getItem("token");
  if (!token) return null;
  let exp = 0;
  try {
    const [, payload] = token.split(".");
    const data = JSON.parse(base64UrlDecode(payload));
    exp = data.exp ?? 0;
  } catch {
    return token;
  }
  if (exp && Date.now() / 1000 >= exp) {
    const resp = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
    });
    if (!resp.ok) {
      logout();
      return null;
    }
    const data = await resp.json();
    token = data.access_token;
    window.localStorage?.setItem("token", token);
  }
  return token;
}

interface TokenPayload {
  username?: string;
  is_admin?: boolean;
  [key: string]: unknown;
}

function getTokenPayload(): TokenPayload | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage?.getItem("token");
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    return JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
}

export function currentUsername(): string | null {
  const payload = getTokenPayload();
  return payload?.username ?? null;
}

export function isLoggedIn(): boolean {
  return getTokenPayload() !== null;
}

export function logout() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("token");
    // Manually notify listeners since the `storage` event doesn't fire in
    // the same tab that performed the update.  Header components listen for
    // this event to refresh login state.
    window.dispatchEvent(new Event("storage"));
  }
}

export function isAdmin(): boolean {
  const payload = getTokenPayload();
  return !!payload?.is_admin;
}
