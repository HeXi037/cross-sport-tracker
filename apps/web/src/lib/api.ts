// apps/web/src/lib/api.ts
import { TIME_ZONE_COOKIE_KEY } from "./i18n";

export type ApiRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};
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

const ACCESS_TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refresh_token";
export const SESSION_ENDED_STORAGE_KEY = "cst:session-ended";
export const SESSION_ENDED_EVENT = "cst:session-ended";
const REFRESH_BUFFER_SECONDS = 30;
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

type LogoutReason = "manual" | "expired" | "error";
export type SessionEndDetail = {
  reason: Exclude<LogoutReason, "manual">;
  timestamp: number;
};
type TokenUpdate = { access_token?: string; refresh_token?: string };

let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
let refreshPromise: Promise<string | null> | null = null;

function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage?.getItem(ACCESS_TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function readStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage?.getItem(REFRESH_TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function hasStoredSessionTokens(
  accessToken?: string | null,
  refreshToken?: string | null
): boolean {
  if (typeof window === "undefined") return false;
  if (accessToken === undefined) {
    accessToken = readStoredAccessToken();
  }
  if (refreshToken === undefined) {
    refreshToken = readStoredRefreshToken();
  }
  return Boolean(accessToken || refreshToken);
}

function cancelScheduledRefresh() {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }
}

function broadcastSessionEnd(reason: Exclude<LogoutReason, "manual">) {
  if (typeof window === "undefined") return;
  const detail: SessionEndDetail = { reason, timestamp: Date.now() };
  try {
    window.localStorage?.setItem(
      SESSION_ENDED_STORAGE_KEY,
      JSON.stringify(detail)
    );
  } catch {
    // Ignore storage errors – the banner is a best-effort hint.
  }
  window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail }));
}

function scheduleAccessTokenRefresh(token: string | null) {
  cancelScheduledRefresh();
  if (!token) return;
  const payload = getTokenPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!exp) return;
  const refreshAt = exp * 1000 - REFRESH_BUFFER_SECONDS * 1000;
  const delay = Math.max(refreshAt - Date.now(), 0);
  refreshTimeout = setTimeout(() => {
    ensureAccessTokenValid(true).catch((err) => {
      console.error("Failed to refresh session", err);
    });
  }, delay);
}

export function persistSession(tokens: TokenUpdate): void {
  if (typeof window === "undefined") return;
  const { access_token, refresh_token } = tokens;
  try {
    if (access_token) {
      window.localStorage?.setItem(ACCESS_TOKEN_KEY, access_token);
    }
    if (refresh_token) {
      window.localStorage?.setItem(REFRESH_TOKEN_KEY, refresh_token);
    }
    if (access_token || refresh_token) {
      window.localStorage?.removeItem(SESSION_ENDED_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors; they'll surface when we next read tokens.
  }
  const activeToken = access_token ?? readStoredAccessToken();
  scheduleAccessTokenRefresh(activeToken);
  window.dispatchEvent(new Event("storage"));
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = readStoredRefreshToken();
    if (!refreshToken) {
      if (hasStoredSessionTokens()) {
        logout("expired");
      }
      return null;
    }
    let response: Response;
    try {
      response = await fetch(apiUrl("/v0/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
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
      if (response.status === 401 && hasStoredSessionTokens(undefined, refreshToken)) {
        logout("expired");
      }
      throw err;
    }

    const data = (await response.json()) as TokenResponse;
    persistSession(data);
    return data.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function ensureAccessTokenValid(
  forceRefresh = false
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const token = readStoredAccessToken();
  if (!token) return null;
  const payload = getTokenPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!exp) return token;
  const nowSeconds = Date.now() / 1000;
  if (forceRefresh || exp - REFRESH_BUFFER_SECONDS <= nowSeconds) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      scheduleAccessTokenRefresh(refreshed);
      return refreshed;
    }
    return readStoredAccessToken();
  }
  return token;
}

if (typeof window !== "undefined") {
  scheduleAccessTokenRefresh(readStoredAccessToken());
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
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    const cookieStore = cookies();
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
    }
  }

  if (typeof window !== "undefined") {
    let token: string | null = null;
    try {
      token = await ensureAccessTokenValid();
    } catch (err) {
      console.error("Failed to ensure access token", err);
      token = readStoredAccessToken();
    }
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      const method = (init?.method ?? "GET").toUpperCase();
      if (!SAFE_HTTP_METHODS.has(method)) {
        const csrf = getCsrfTokenFromToken(token);
        if (csrf) {
          headers.set("X-CSRF-Token", csrf);
        }
      }
    }
  }

  const res = await fetch(apiUrl(path), { ...init, headers });

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

    if (shouldLogout && hasStoredSessionTokens()) {
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

interface TokenPayload {
  username?: string;
  is_admin?: boolean;
  sub?: string;
  csrf?: string;
  [key: string]: unknown;
}

function getTokenPayload(token?: string | null): TokenPayload | null {
  const rawToken = token ?? readStoredAccessToken();
  if (!rawToken) return null;
  try {
    const [, payload] = rawToken.split(".");
    return JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
}

function getCsrfTokenFromToken(token?: string | null): string | null {
  const payload = getTokenPayload(token);
  const csrf = payload?.csrf;
  return typeof csrf === "string" ? csrf : null;
}

export function currentUsername(): string | null {
  const payload = getTokenPayload();
  return payload?.username ?? null;
}

export function currentUserId(): string | null {
  const payload = getTokenPayload();
  return typeof payload?.sub === "string" ? payload.sub : null;
}

export function isLoggedIn(): boolean {
  return getTokenPayload() !== null;
}

export function csrfToken(): string | null {
  return getCsrfTokenFromToken();
}

export function logout(reason: LogoutReason = "manual") {
  if (typeof window === "undefined") return;
  cancelScheduledRefresh();
  refreshPromise = null;
  try {
    window.localStorage?.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage?.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Ignore storage errors when clearing tokens.
  }
  if (reason === "manual") {
    try {
      window.localStorage?.removeItem(SESSION_ENDED_STORAGE_KEY);
    } catch {
      // Ignore storage errors when clearing session notifications.
    }
  } else {
    broadcastSessionEnd(reason);
  }
  // Manually notify listeners since the `storage` event doesn't fire in the
  // same tab that performed the update. Header components listen for this
  // event to refresh login state.
  window.dispatchEvent(new Event("storage"));
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
  csrf_token?: string;
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

