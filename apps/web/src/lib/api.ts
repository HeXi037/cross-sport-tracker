// apps/web/src/lib/api.ts
import { TIME_ZONE_COOKIE_KEY } from "./i18n";

export type ApiRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

function normalizeApiBase(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function resolveServerApiBase(): string {
  const internalBase = process.env.INTERNAL_API_BASE_URL?.trim() ?? "";
  const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";

  if (internalBase) {
    return internalBase;
  }
  if (publicBase) {
    return publicBase;
  }

  const message =
    "API base URL is not configured for server-side rendering. Set INTERNAL_API_BASE_URL or NEXT_PUBLIC_API_BASE_URL.";
  throw new Error(message);
}

function resolveClientApiBase(): string {
  const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
  return publicBase || "/api";
}

export function assertApiBaseConfigured(): void {
  if (typeof window !== "undefined") {
    return;
  }

  try {
    resolveServerApiBase();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "API base URL is not configured.";
    console.error(message);
    throw err;
  }
}

export function apiBase(): string {
  const server = typeof window === 'undefined';
  const base = server ? resolveServerApiBase() : resolveClientApiBase();
  return normalizeApiBase(base);
}

export function apiUrl(path: string): string {
  const b = apiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

const SESSION_HINT_COOKIE = "session_hint";
const CSRF_COOKIE = "csrf_token";
export const SESSION_ENDED_STORAGE_KEY = "cst:session-ended";
export const SESSION_ENDED_EVENT = "cst:session-ended";
export const SESSION_CHANGED_EVENT = "cst:session-changed";
const SESSION_CHANNEL_NAME = "cst:session-channel";
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

type LogoutReason = "manual" | "expired" | "error";
export type SessionEndDetail = {
  reason: Exclude<LogoutReason, "manual">;
  timestamp: number;
};
let refreshPromise: Promise<void> | null = null;
let sessionChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  sessionChannel = new BroadcastChannel(SESSION_CHANNEL_NAME);
}
if (sessionChannel && typeof window !== "undefined") {
  sessionChannel.onmessage = (event) => {
    const payload = event.data ?? {};
    if (payload?.type === SESSION_ENDED_EVENT) {
      const detail = payload.detail as SessionEndDetail | undefined;
      window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail }));
    } else if (payload?.type === SESSION_CHANGED_EVENT) {
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    }
  };
}

function readCookieValue(cookieString: string, name: string): string | null {
  const cookies = cookieString.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (!cookie) continue;
    const [key, ...rest] = cookie.split("=");
    if (key === decodeURIComponent(name)) {
      return rest.join("=");
    }
  }
  return null;
}

function getClientCookie(name: string): string | null {
  if (typeof window === "undefined") return null;
  return readCookieValue(document.cookie ?? "", name);
}

export function setSessionHintCookie(value: string | null | undefined): void {
  if (typeof window === "undefined") return;
  if (value === undefined) return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  if (value === null || value.trim() === "") {
    document.cookie = `${SESSION_HINT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    return;
  }
  const maxAgeSeconds = 60 * 60 * 24 * 30; // Align with refresh token lifetime.
  document.cookie = `${SESSION_HINT_COOKIE}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
}

async function getServerCookie(name: string): Promise<string | null> {
  if (typeof window !== "undefined") return getClientCookie(name);
  try {
    const { cookies } = await import("next/headers");
    const store = cookies();
    const value = store.get(name)?.value ?? null;
    return value ?? null;
  } catch {
    return null;
  }
}

function notifySessionChanged(detail?: SessionEndDetail | null) {
  if (typeof window === "undefined") return;
  if (detail) {
    try {
      window.localStorage?.setItem(SESSION_ENDED_STORAGE_KEY, JSON.stringify(detail));
    } catch {
      // Ignore persistence errors.
    }
    window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail }));
    sessionChannel?.postMessage({ type: SESSION_ENDED_EVENT, detail });
  } else {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    sessionChannel?.postMessage({ type: SESSION_CHANGED_EVENT });
  }
}

export function persistSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(SESSION_ENDED_STORAGE_KEY);
  } catch {
    // Ignore storage quota errors.
  }
  notifySessionChanged(null);
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    await refreshPromise;
    return true;
  }

  refreshPromise = (async () => {
    let response: Response;
    try {
      const activeFetch = (globalThis as any).fetch ?? fetch;
      response = await activeFetch(apiUrl("/v0/auth/refresh"), {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      throw err;
    }

    if (!response.ok) {
      let problemMessage: string | undefined;
      try {
        const data = await response.clone().json();
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
      if (!problemMessage) {
        text = await response.text();
      }

      const message =
        problemMessage ?? text ?? response.statusText ?? "Unknown error";
      const err: Error & { status?: number } = new Error(
        `HTTP ${response.status}: ${message}`
      );
      err.status = response.status;
      throw err;
    }

    const payload = (await response.json()) as TokenResponse | undefined;
    setSessionHintCookie(payload?.sessionHint);
    persistSession();
  })();

  try {
    await refreshPromise;
    return true;
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401) {
      logout("expired");
    }
    throw err;
  } finally {
    refreshPromise = null;
  }
}

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

  const base = apiBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (ABSOLUTE_URL_REGEX.test(base)) {
    try {
      const baseUrl = new URL(base);
      const basePath = baseUrl.pathname.endsWith('/')
        ? baseUrl.pathname.slice(0, -1)
        : baseUrl.pathname;
      if (basePath && normalizedPath.startsWith(`${basePath}/`)) {
        return normalizedPath;
      }
      if (!basePath || basePath === '/') {
        return normalizedPath;
      }
      return `${basePath}${normalizedPath}`;
    } catch {
      // If the base URL cannot be parsed, fall through to the default logic.
    }
  }

  if (!ABSOLUTE_URL_REGEX.test(base)) {
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    if (normalizedPath.startsWith(normalizedBase)) {
      return normalizedPath;
    }
  }

  return apiUrl(path);
}

export type NormalizePhotoUrlOptions = {
  cacheBustToken?: string | number | null | undefined;
};

export function normalizePhotoUrl(
  value: string | null | undefined,
  options?: NormalizePhotoUrlOptions
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  let trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  trimmed = trimmed.replace(/\s*undefined$/i, '').trim();
  if (!trimmed) {
    return null;
  }

  const absolute = ensureAbsoluteApiUrl(trimmed);
  if (absolute == null) {
    return null;
  }

  const token = options?.cacheBustToken;
  if (token == null) {
    return absolute;
  }

  const serializedToken = `${token}`.trim();
  if (!serializedToken) {
    return absolute;
  }

  const separator = absolute.includes('?') ? '&' : '?';
  return `${absolute}${separator}t=${encodeURIComponent(serializedToken)}`;
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

export type ApiError = Error & {
  status?: number;
  code?: string;
  parsedMessage?: string;
};

async function executeFetch(
  path: string,
  init: ApiRequestInit | undefined,
  attempt: number
): Promise<Response> {
  const headers = new Headers(init?.headers);
  let serverCookieHeader: string | null = null;
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    const cookieStore = cookies();
    serverCookieHeader = cookieStore
      .getAll()
      .map((entry) => `${entry.name}=${encodeURIComponent(entry.value)}`)
      .join("; ");
    const rawTimeZone = cookieStore.get(TIME_ZONE_COOKIE_KEY)?.value ?? null;
    const preferredTimeZone =
      typeof rawTimeZone === "string" && rawTimeZone.trim().length > 0
        ? rawTimeZone.trim()
        : null;

    if (preferredTimeZone) {
      const serialized = `${TIME_ZONE_COOKIE_KEY}=${encodeURIComponent(
        preferredTimeZone,
      )}`;
      const existingCookieHeader = headers.get("cookie");
      if (existingCookieHeader) {
        const hasTimeZoneCookie = existingCookieHeader
          .split(";")
          .some((part) =>
            part.trim().toLowerCase().startsWith(
              `${TIME_ZONE_COOKIE_KEY.toLowerCase()}=`,
            ),
          );
        if (!hasTimeZoneCookie) {
          headers.set("cookie", `${existingCookieHeader}; ${serialized}`);
        }
      } else {
        headers.set("cookie", serialized);
      }
    } else if (serverCookieHeader) {
      const existingCookieHeader = headers.get("cookie");
      if (existingCookieHeader) {
        headers.set("cookie", `${existingCookieHeader}; ${serverCookieHeader}`);
      } else {
        headers.set("cookie", serverCookieHeader);
      }
    }
  }

  const method = (init?.method ?? "GET").toUpperCase();
  if (!SAFE_HTTP_METHODS.has(method)) {
    let csrf: string | null = null;
    if (typeof window === "undefined") {
      csrf = readCookieValue(headers.get("cookie") ?? serverCookieHeader ?? "", CSRF_COOKIE);
    } else {
      csrf = getClientCookie(CSRF_COOKIE);
    }
    if (csrf) {
      headers.set("X-CSRF-Token", csrf);
    }
  }

  let res: Response | undefined;
  try {
    // Use globalThis.fetch to ensure test-time global.fetch replacement is used.
    const activeFetch = (globalThis as any).fetch ?? fetch;
    const credentials = init?.credentials ?? "include";
    res = await activeFetch(apiUrl(path), { ...init, headers, credentials });
  } catch (err) {
    const apiErr: ApiError =
      err instanceof Error ? err : new Error("Network request failed");
    if (apiErr.status === undefined) {
      apiErr.status = 0;
    }
    throw apiErr;
  }

  if (!res) {
    const err: ApiError = new Error("No response received from API");
    err.status = 0;
    throw err;
  }

  if (res.status === 401 && typeof window !== "undefined" && attempt === 0) {
    try {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return executeFetch(path, init, attempt + 1);
      }
    } catch (refreshErr) {
      console.error("Failed to refresh access token", refreshErr);
    }
  }

  if (res.ok) {
    return res;
  }

  let problemMessage: string | undefined;
  let errorCode: string | undefined;
  try {
    const data = await res.clone().json();
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const detail = record.detail;
      const title = record.title;
      const code = record.code;
      if (typeof code === "string" && code.length > 0) {
        errorCode = code;
      }
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

  const parsedMessage = problemMessage ?? text;
  const message = parsedMessage ?? res.statusText ?? "Unknown error";
  const logoutSource = (problemMessage ?? text ?? "").toLowerCase();

  if (res.status === 401) {
    const shouldLogout =
      logoutSource.includes("token expired") ||
      logoutSource.includes("missing token") ||
      logoutSource.includes("invalid token") ||
      logoutSource.includes("user not found") ||
      logoutSource.includes("not authenticated");

    if (shouldLogout) {
      logout("expired");
    }
  }

  const err: ApiError = new Error(`HTTP ${res.status}: ${message}`);
  err.status = res.status;
  if (errorCode) {
    err.code = errorCode;
  }
  if (typeof parsedMessage === "string" && parsedMessage.length > 0) {
    err.parsedMessage = parsedMessage;
  }
  throw err;
}

export async function apiFetch(path: string, init?: ApiRequestInit) {
  try {
    return await executeFetch(path, init, 0);
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

type SessionHint = {
  uid?: string;
  username?: string;
  is_admin?: boolean;
  must_change_password?: boolean;
};

function parseSessionHint(raw: string | null): SessionHint | null {
  if (!raw) return null;
  let normalized = raw;
  try {
    normalized = decodeURIComponent(raw);
  } catch {
    // Ignore decoding errors and fall back to the raw value.
  }
  try {
    const decoded = base64UrlDecode(normalized);
    const parsed = JSON.parse(decoded) as SessionHint;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Ignore parsing errors.
  }
  return null;
}

function getSessionHint(): SessionHint | null {
  return parseSessionHint(getClientCookie(SESSION_HINT_COOKIE));
}

export function currentUsername(): string | null {
  return getSessionHint()?.username ?? null;
}

export function currentUserId(): string | null {
  const hint = getSessionHint();
  return typeof hint?.uid === "string" ? hint.uid : null;
}

export function isLoggedIn(): boolean {
  return getSessionHint() !== null;
}

export function mustChangePasswordRequired(): boolean {
  const hint = getSessionHint();
  const flag = hint?.must_change_password;
  return typeof flag === "boolean" ? flag : false;
}

export function csrfToken(): string | null {
  return getClientCookie(CSRF_COOKIE);
}

export function logout(reason: LogoutReason = "manual") {
  if (typeof window === "undefined") return;
  refreshPromise = null;
  setSessionHintCookie(null);
  const detail =
    reason === "manual" ? null : ({ reason, timestamp: Date.now() } satisfies SessionEndDetail);
  if (detail) {
    try {
      window.localStorage?.setItem(SESSION_ENDED_STORAGE_KEY, JSON.stringify(detail));
    } catch {
      // Ignore storage errors when recording session end.
    }
    window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail }));
    sessionChannel?.postMessage({ type: SESSION_ENDED_EVENT, detail });
  } else {
    try {
      window.localStorage?.removeItem(SESSION_ENDED_STORAGE_KEY);
    } catch {
      // Ignore storage errors when clearing session notifications.
    }
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    sessionChannel?.postMessage({ type: SESSION_CHANGED_EVENT });
  }
  void fetch(apiUrl("/v0/auth/revoke"), {
    method: "POST",
    credentials: "include",
  }).catch(() => {
    // Ignore network errors when attempting to revoke the session.
  });
}

export function isAdmin(): boolean {
  const hint = getSessionHint();
  return !!hint?.is_admin;
}

export interface UserMe {
  id: string;
  username: string;
  is_admin: boolean;
  photo_url?: string | null;
  mustChangePassword?: boolean;
}

export async function fetchMe(): Promise<UserMe> {
  const res = await apiFetch("/v0/auth/me");
  const data = (await res.json()) as UserMe;
  return withAbsolutePhotoUrl(data);
}

export interface TokenResponse {
  mustChangePassword?: boolean;
  sessionHint?: string | null;
}

export type UpdateMeResponse = TokenResponse;

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
  setSessionHintCookie(payload?.sessionHint);
  return {
    mustChangePassword: payload?.mustChangePassword,
    sessionHint: payload?.sessionHint,
  };
}

export interface ClubSummary {
  id: string;
  name: string;
}

export async function fetchClubs(
  init?: ApiRequestInit
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

export interface PushSubscriptionKeysPayload {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionSummary {
  id: string;
  endpoint: string;
  createdAt: string;
}

export interface NotificationPreferences {
  notifyOnProfileComments: boolean;
  notifyOnMatchResults: boolean;
  pushEnabled: boolean;
  subscriptions: PushSubscriptionSummary[];
}

export type NotificationPreferenceUpdatePayload = Partial<{
  notifyOnProfileComments: boolean;
  notifyOnMatchResults: boolean;
  pushEnabled: boolean;
}>;

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeysPayload;
  contentEncoding?: string;
}

export interface NotificationRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt?: string | null;
}

export interface NotificationListResponse {
  items: NotificationRecord[];
  unreadCount: number;
}

export async function fetchMyPlayer(): Promise<PlayerMe> {
  const res = await apiFetch("/v0/players/me");
  const data = (await res.json()) as PlayerMe;
  return withAbsolutePhotoUrl(data);
}

export async function createMyPlayer(): Promise<PlayerMe> {
  const res = await apiFetch("/v0/players/me", { method: "POST" });
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

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await apiFetch("/v0/notifications/preferences");
  return res.json();
}

export async function updateNotificationPreferences(
  data: NotificationPreferenceUpdatePayload
): Promise<NotificationPreferences> {
  const res = await apiFetch("/v0/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function registerPushSubscription(
  payload: PushSubscriptionPayload
): Promise<PushSubscriptionSummary> {
  const res = await apiFetch("/v0/notifications/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: payload.endpoint,
      keys: payload.keys,
      contentEncoding: payload.contentEncoding,
    }),
  });
  return res.json();
}

export async function deletePushSubscriptions(): Promise<void> {
  await apiFetch("/v0/notifications/subscriptions", { method: "DELETE" });
}

export async function listNotifications(
  limit = 50,
  offset = 0
): Promise<NotificationListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await apiFetch(`/v0/notifications?${params.toString()}`);
  return res.json();
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiFetch(`/v0/notifications/${notificationId}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/v0/notifications/read-all", { method: "POST" });
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

export type TournamentCreatePayload = {
  sport: string;
  name: string;
  clubId?: string | null;
};

export type TournamentSummary = TournamentCreatePayload & {
  id: string;
  createdByUserId?: string | null;
};

export type TournamentUpdatePayload = {
  name?: string | null;
  sport?: string | null;
  clubId?: string | null;
};

export type StageCreatePayload = {
  type: string;
  config?: Record<string, unknown> | null;
};

export type StageSummary = StageCreatePayload & {
  id: string;
  tournamentId: string;
};

export type StageScheduleParticipant = {
  id: string;
  side: "A" | "B" | "C" | "D" | "E" | "F";
  playerIds: string[];
};

export type StageScheduleMatch = {
  id: string;
  sport: string;
  stageId: string;
  bestOf?: number | null;
  playedAt?: string | null;
  location?: string | null;
  isFriendly: boolean;
  rulesetId?: string | null;
  participants: StageScheduleParticipant[];
};

export type StageSchedulePayload = {
  playerIds: string[];
  rulesetId?: string | null;
  courtCount?: number | null;
};

export type StageScheduleResponse = {
  stageId: string;
  matches: StageScheduleMatch[];
};

export type StageStanding = {
  playerId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  pointsScored: number;
  pointsAllowed: number;
  pointsDiff: number;
  setsWon: number;
  setsLost: number;
  points: number;
};

export type StageStandings = {
  stageId: string;
  standings: StageStanding[];
};

function withNoStore(
  init?: ApiRequestInit
): ApiRequestInit | undefined {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Cache-Control", "no-store");

  if (!init) {
    return { cache: "no-store", headers };
  }

  if (init.cache === "no-store") {
    return { ...init, headers };
  }

  return { ...init, cache: "no-store", headers };
}

export async function listTournaments(
  init?: ApiRequestInit
): Promise<TournamentSummary[]> {
  const res = await apiFetch("/v0/tournaments", withNoStore(init));
  return res.json();
}

export async function getTournament(
  tournamentId: string,
  init?: ApiRequestInit
): Promise<TournamentSummary> {
  const res = await apiFetch(
    `/v0/tournaments/${tournamentId}`,
    withNoStore(init)
  );
  return res.json();
}

export async function createTournament(
  payload: TournamentCreatePayload
): Promise<TournamentSummary> {
  const res = await apiFetch("/v0/tournaments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateTournament(
  tournamentId: string,
  payload: TournamentUpdatePayload
): Promise<TournamentSummary> {
  const entries = Object.entries(payload).filter(
    (entry): entry is [string, string | null] => entry[1] !== undefined
  );
  const body = Object.fromEntries(entries);
  const res = await apiFetch(`/v0/tournaments/${tournamentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  await apiFetch(`/v0/tournaments/${tournamentId}`, { method: "DELETE" });
}

export async function createStage(
  tournamentId: string,
  payload: StageCreatePayload
): Promise<StageSummary> {
  const res = await apiFetch(`/v0/tournaments/${tournamentId}/stages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function listTournamentStages(
  tournamentId: string,
  init?: ApiRequestInit
): Promise<StageSummary[]> {
  const res = await apiFetch(
    `/v0/tournaments/${tournamentId}/stages`,
    withNoStore(init)
  );
  return res.json();
}

export async function scheduleAmericanoStage(
  tournamentId: string,
  stageId: string,
  payload: StageSchedulePayload
): Promise<StageScheduleResponse> {
  const res = await apiFetch(
    `/v0/tournaments/${tournamentId}/stages/${stageId}/schedule`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return res.json();
}

export async function fetchStageStandings(
  tournamentId: string,
  stageId: string,
  init?: ApiRequestInit
): Promise<StageStandings> {
  const res = await apiFetch(
    `/v0/tournaments/${tournamentId}/stages/${stageId}/standings`,
    withNoStore(init)
  );
  return res.json();
}

export async function listStageMatches(
  tournamentId: string,
  stageId: string,
  init?: ApiRequestInit
): Promise<StageScheduleMatch[]> {
  const res = await apiFetch(
    `/v0/tournaments/${tournamentId}/stages/${stageId}/matches`,
    withNoStore(init)
  );
  return res.json();
}
