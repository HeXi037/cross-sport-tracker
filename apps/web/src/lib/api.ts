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
  if (typeof window !== "undefined") {
    const token = window.localStorage?.getItem("token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    return await fetch(apiUrl(path), { ...init, headers });
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

export function isAdmin(): boolean {
  if (typeof window === "undefined") return false;
  const token = window.localStorage?.getItem("token");
  if (!token) return false;
  try {
    const [, payload] = token.split(".");
    const decoded = JSON.parse(base64UrlDecode(payload));
    return !!decoded.is_admin;
  } catch {
    return false;
  }
}
