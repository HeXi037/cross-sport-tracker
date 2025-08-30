// apps/web/src/lib/api.ts
export function apiBase(): string {
  const server = typeof window === 'undefined';
  const base = server
    ? process.env.INTERNAL_API_BASE_URL || 'http://backend:8000/api'
    : process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function apiUrl(path: string): string {
  const b = apiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
