import { ALL_SPORTS, SPORT_OPTIONS } from "./leaderboard/constants";
import { COUNTRY_OPTIONS } from "../lib/countries";
import { normalizeLocale, storeLocalePreference } from "../lib/i18n";

export const USER_SETTINGS_STORAGE_KEY = "cst:user-settings";
export const USER_SETTINGS_CHANGED_EVENT = "cst:user-settings-change";

const SPORT_OPTION_SET = new Set<string>(SPORT_OPTIONS);
const COUNTRY_CODE_SET = new Set<string>(COUNTRY_OPTIONS.map((option) => option.code));

export interface UserSettings {
  defaultLeaderboardSport: string;
  defaultLeaderboardCountry: string;
  weeklySummaryEmails: boolean;
  preferredLocale: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultLeaderboardSport: ALL_SPORTS,
  defaultLeaderboardCountry: "",
  weeklySummaryEmails: true,
  preferredLocale: "",
};

export function getDefaultUserSettings(): UserSettings {
  return { ...DEFAULT_USER_SETTINGS };
}

function sanitizeSport(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_USER_SETTINGS.defaultLeaderboardSport;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_USER_SETTINGS.defaultLeaderboardSport;
  }
  return SPORT_OPTION_SET.has(trimmed)
    ? trimmed
    : DEFAULT_USER_SETTINGS.defaultLeaderboardSport;
}

function sanitizeCountry(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_USER_SETTINGS.defaultLeaderboardCountry;
  }
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return "";
  }
  return COUNTRY_CODE_SET.has(trimmed)
    ? trimmed
    : DEFAULT_USER_SETTINGS.defaultLeaderboardCountry;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
}

function sanitizePreferredLocale(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_USER_SETTINGS.preferredLocale;
  }
  const normalized = normalizeLocale(value, "");
  return normalized;
}

export type PartialUserSettings = Partial<UserSettings> | null | undefined;

export function normalizeUserSettings(value: PartialUserSettings): UserSettings {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultUserSettings();
  }
  const record = value as Record<string, unknown>;
  return {
    defaultLeaderboardSport: sanitizeSport(record.defaultLeaderboardSport),
    defaultLeaderboardCountry: sanitizeCountry(record.defaultLeaderboardCountry),
    weeklySummaryEmails: sanitizeBoolean(
      record.weeklySummaryEmails,
      DEFAULT_USER_SETTINGS.weeklySummaryEmails,
    ),
    preferredLocale: sanitizePreferredLocale(record.preferredLocale),
  };
}

export function loadUserSettings(): UserSettings {
  if (typeof window === "undefined") {
    return getDefaultUserSettings();
  }
  try {
    const raw = window.localStorage?.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return getDefaultUserSettings();
    }
    const parsed = JSON.parse(raw) as PartialUserSettings;
    return normalizeUserSettings(parsed);
  } catch {
    return getDefaultUserSettings();
  }
}

export function saveUserSettings(settings: PartialUserSettings): UserSettings {
  const normalized = normalizeUserSettings(settings);
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(
        USER_SETTINGS_STORAGE_KEY,
        JSON.stringify(normalized),
      );
    } catch {
      // Ignore storage quota errors or unavailable localStorage.
    }
    window.dispatchEvent(new Event(USER_SETTINGS_CHANGED_EVENT));
  }
  storeLocalePreference(normalized.preferredLocale);
  return normalized;
}

export function areUserSettingsEqual(
  a: UserSettings,
  b: UserSettings,
): boolean {
  return (
    a.defaultLeaderboardSport === b.defaultLeaderboardSport &&
    a.defaultLeaderboardCountry === b.defaultLeaderboardCountry &&
    a.weeklySummaryEmails === b.weeklySummaryEmails &&
    a.preferredLocale === b.preferredLocale
  );
}

export function clearUserSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(USER_SETTINGS_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
  storeLocalePreference("");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(USER_SETTINGS_CHANGED_EVENT));
  }
}
