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

const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export function ensureAbsoluteApiUrl(path: string): string;
export function ensureAbsoluteApiUrl(path: string | null): string | null;
export function ensureAbsoluteApiUrl(path: string | undefined): string | undefined;
export function ensureAbsoluteApiUrl(
  path: string | null | undefined
): string | null | undefined {
  if (path == null) return path;
  if (path === '') return path;
  if (path.startsWith('//')) return path;
  if (ABSOLUTE_URL_REGEX.test(path)) return path;

  if (path.startsWith('/')) {
    const base = apiBase();

    if (!ABSOLUTE_URL_REGEX.test(base)) {
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      if (path.startsWith(normalizedBase)) {
        return path;
      }
    } else {
      try {
        const baseUrl = new URL(base);
        const pathnameWithTrailingSlash = baseUrl.pathname.endsWith('/')
          ? baseUrl.pathname
          : `${baseUrl.pathname}/`;
        if (
          baseUrl.pathname === '/' ||
          path.startsWith(pathnameWithTrailingSlash)
        ) {
          return `${baseUrl.origin}${path}`;
        }
      } catch {
        // If the base URL cannot be parsed, fall through to the default logic.
      }
    }
  }

  return apiUrl(path);
}

export function withAbsolutePhotoUrl<T extends { photo_url?: string | null }>(
  entity: T
): T {
  const url = entity?.photo_url;
  if (typeof url !== 'string') return entity;
  const normalized = ensureAbsoluteApiUrl(url);
  if (normalized === url) return entity;
  return { ...entity, photo_url: normalized } as T;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const token = window.localStorage?.getItem("token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    const res = await fetch(apiUrl(path), { ...init, headers });
    if (!res.ok) {
      let problemMessage: string | undefined;
      try {
        const data = await res.clone().json();
        if (data && typeof data === "object") {
          const detail = (data as Record<string, unknown>).detail;
          const title = (data as Record<string, unknown>).title;
          if (typeof detail === "string" && detail.length > 0) {
            problemMessage = detail;
          } else if (typeof title === "string" && title.length > 0) {
            problemMessage = title;
          }
        }
      } catch {
        // Ignore JSON parsing issues and fall back to reading the text body.
      }

      let text: string | undefined;
      if (!problemMessage || res.status === 401) {
        text = await res.text();
      }

      const message = problemMessage ?? text ?? res.statusText ?? "Unknown error";
      const logoutSource = problemMessage ?? text ?? "";

      if (res.status === 401 && logoutSource.includes("token expired")) {
        logout();
      }

      const err: Error & { status?: number } = new Error(
        `HTTP ${res.status}: ${message}`
      );
      err.status = res.status;
      throw err;
    }
    return res;
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

export interface UserMe {
  id: string;
  username: string;
  is_admin: boolean;
  photo_url?: string | null;
}

export async function fetchMe(): Promise<UserMe> {
  const res = await apiFetch("/v0/auth/me");
  const data = (await res.json()) as UserMe;
  return withAbsolutePhotoUrl(data);
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

export type UpdateMeResponse = Partial<TokenResponse>;

export async function updateMe(data: {
  username?: string;
  password?: string;
}): Promise<UpdateMeResponse> {
  const res = await apiFetch("/v0/auth/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await res.json()) as UpdateMeResponse;
  return payload;
}

export interface ClubSummary {
  id: string;
  name: string;
}

export async function fetchClubs(
  init?: RequestInit
): Promise<ClubSummary[]> {
  const res = await apiFetch("/v0/clubs", init);
  return res.json();
}

export interface PlayerMe {
  id: string;
  name: string;
  location: string | null;
  country_code: string | null;
  region_code: string | null;
  club_id?: string | null;
  photo_url?: string | null;
  bio?: string | null;
  social_links?: PlayerSocialLink[];
}

export type PlayerLocationPayload = {
  location?: string | null;
  country_code?: string | null;
  region_code?: string | null;
  club_id?: string | null;
  bio?: string | null;
};

export interface PlayerSocialLink {
  id: string;
  label: string;
  url: string;
  created_at: string;
}

export type PlayerSocialLinkCreatePayload = {
  label: string;
  url: string;
};

export type PlayerSocialLinkUpdatePayload = Partial<PlayerSocialLinkCreatePayload>;

export async function fetchMyPlayer(): Promise<PlayerMe> {
  const res = await apiFetch("/v0/players/me");
  const data = (await res.json()) as PlayerMe;
  return withAbsolutePhotoUrl(data);
}

export async function updateMyPlayerLocation(
  data: PlayerLocationPayload
): Promise<PlayerMe> {
  const payloadEntries = Object.entries(data).filter(
    (entry): entry is [string, string | null] => entry[1] !== undefined
  );
  const body = Object.fromEntries(payloadEntries);
  const res = await apiFetch("/v0/players/me/location", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const updated = (await res.json()) as PlayerMe;
  return withAbsolutePhotoUrl(updated);
}

export async function listMySocialLinks(): Promise<PlayerSocialLink[]> {
  const res = await apiFetch("/v0/players/me/social-links");
  return res.json();
}

export async function createMySocialLink(
  data: PlayerSocialLinkCreatePayload
): Promise<PlayerSocialLink> {
  const res = await apiFetch("/v0/players/me/social-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateMySocialLink(
  linkId: string,
  data: PlayerSocialLinkUpdatePayload
): Promise<PlayerSocialLink> {
  const res = await apiFetch(`/v0/players/me/social-links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMySocialLink(linkId: string): Promise<void> {
  await apiFetch(`/v0/players/me/social-links/${linkId}`, {
    method: "DELETE",
  });
}

export async function updatePlayerLocation(
  playerId: string,
  data: PlayerLocationPayload
): Promise<PlayerMe> {
  const payloadEntries = Object.entries(data).filter(
    (entry): entry is [string, string | null] => entry[1] !== undefined
  );
  const body = Object.fromEntries(payloadEntries);
  const res = await apiFetch(`/v0/players/${playerId}/location`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const updated = (await res.json()) as PlayerMe;
  return withAbsolutePhotoUrl(updated);
}
