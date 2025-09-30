export const NEUTRAL_FALLBACK_LOCALE = 'en-GB';
export const DEFAULT_TIME_ZONE = 'UTC';

type LocalePreference = {
  locale: string;
  quality: number;
  order: number;
};

export function parseAcceptLanguage(
  header: string | null | undefined,
  defaultLocale = NEUTRAL_FALLBACK_LOCALE,
): string {
  if (!header) return defaultLocale;

  const preferences = header
    .split(',')
    .map((part, index): LocalePreference | null => {
      const [rawLocale, ...params] = part.trim().split(';').map((value) => value.trim());
      if (!rawLocale) {
        return null;
      }

      let quality = 1;
      for (const param of params) {
        if (!param.startsWith('q=')) continue;
        const parsed = Number(param.slice(2));
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          quality = parsed;
        }
      }

      const locale = rawLocale === '*' ? defaultLocale : rawLocale;

      return {
        locale,
        quality,
        order: index,
      };
    })
    .filter((pref): pref is LocalePreference => Boolean(pref));

  if (!preferences.length) {
    return defaultLocale;
  }

  const australianPreference = preferences
    .filter((pref) => pref.locale.toLowerCase().startsWith('en-au'))
    .sort((a, b) => {
      if (a.quality !== b.quality) {
        return b.quality - a.quality;
      }
      return a.order - b.order;
    })[0];

  if (australianPreference) {
    return australianPreference.locale;
  }

  const [topPreference] = preferences.sort((a, b) => {
    if (a.quality !== b.quality) {
      return b.quality - a.quality;
    }
    return a.order - b.order;
  });

  return topPreference?.locale ?? defaultLocale;
}

export function normalizeLocale(
  locale: string | null | undefined,
  fallback = NEUTRAL_FALLBACK_LOCALE,
): string {
  if (typeof locale !== 'string') {
    return fallback;
  }
  const trimmed = locale.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const LOCALE_STORAGE_KEY = 'cst:locale';
export const LOCALE_COOKIE_KEY = 'cst-preferred-locale';

export const TIME_ZONE_STORAGE_KEY = 'cst:time-zone';
export const TIME_ZONE_COOKIE_KEY = 'cst-preferred-time-zone';

function normalizeTimeZoneInternal(
  value: string | null | undefined,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    // Validate the time zone identifier using Intl.
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    return fallback;
  }
}

export function normalizeTimeZone(
  value: string | null | undefined,
  fallback = DEFAULT_TIME_ZONE,
): string {
  return normalizeTimeZoneInternal(value, fallback);
}

type LocaleTimeZoneInfo = {
  locale: Intl.Locale;
  timeZones: string[];
  region?: string;
};

const REGION_PRIMARY_TIME_ZONES: Record<string, string> = {
  AU: 'Australia/Melbourne',
  CA: 'America/Toronto',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  NZ: 'Pacific/Auckland',
  US: 'America/New_York',
};

const LOW_PRIORITY_TIME_ZONE_PREFIXES = [
  'Antarctica/',
  'Arctic/',
  'Etc/',
  'GMT',
  'UTC',
];

function getLocaleTimeZoneInfo(
  localeHint: string | null | undefined,
): LocaleTimeZoneInfo | null {
  if (typeof localeHint !== 'string') {
    return null;
  }
  const trimmed = localeHint.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const locale = new Intl.Locale(trimmed);
    const timeZones = Array.from(
      new Set(
        (locale.timeZones ?? [])
          .map((zone) => normalizeTimeZoneInternal(zone, ''))
          .filter((zone): zone is string => Boolean(zone)),
      ),
    );
    const region = locale.maximize().region ?? locale.region ?? undefined;
    return { locale, timeZones, region };
  } catch {
    return null;
  }
}

function pickLocaleDefaultTimeZone(info: LocaleTimeZoneInfo | null): string | null {
  if (!info || info.timeZones.length === 0) {
    return null;
  }

  const { timeZones, region } = info;
  const regionKey = region?.toUpperCase();
  if (regionKey) {
    const override = REGION_PRIMARY_TIME_ZONES[regionKey];
    if (override && timeZones.includes(override)) {
      return override;
    }
  }

  const preferred = timeZones.filter(
    (zone) => !LOW_PRIORITY_TIME_ZONE_PREFIXES.some((prefix) => zone.startsWith(prefix)),
  );

  return preferred[0] ?? timeZones[0] ?? null;
}

export function detectTimeZone(
  localeHint?: string | null,
): string | null {
  const localeInfo = getLocaleTimeZoneInfo(localeHint);

  if (
    typeof window !== 'undefined' &&
    typeof Intl !== 'undefined' &&
    typeof Intl.DateTimeFormat === 'function'
  ) {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const normalizedDetected = normalizeTimeZoneInternal(detected, '');
      if (normalizedDetected) {
        return normalizedDetected;
      }
    } catch {
      // Ignore detection failures and fall back to locale hints.
    }
  }

  return pickLocaleDefaultTimeZone(localeInfo);
}

export function getStoredTimeZone(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage?.getItem(TIME_ZONE_STORAGE_KEY);
    const normalized = normalizeTimeZoneInternal(raw, '');
    if (normalized) {
      return normalized;
    }
  } catch {
    // Ignore storage errors and fall through to cookie lookup.
  }

  if (typeof document !== 'undefined') {
    try {
      const cookieValue = document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((part) => part.startsWith(`${TIME_ZONE_COOKIE_KEY}=`));
      if (cookieValue) {
        const [, value] = cookieValue.split('=');
        const normalized = normalizeTimeZoneInternal(
          decodeURIComponent(value ?? ''),
          '',
        );
        return normalized || null;
      }
    } catch {
      // Ignore cookie parsing failures.
    }
  }

  return null;
}

export function storeTimeZonePreference(
  timeZone: string | null | undefined,
): void {
  if (typeof window === 'undefined' && typeof document === 'undefined') {
    return;
  }
  const normalized = normalizeTimeZoneInternal(timeZone, '');

  if (typeof window !== 'undefined') {
    try {
      if (normalized) {
        window.localStorage?.setItem(TIME_ZONE_STORAGE_KEY, normalized);
      } else {
        window.localStorage?.removeItem(TIME_ZONE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors or unavailable localStorage.
    }
  }

  if (typeof document !== 'undefined') {
    const expires = normalized ? `; max-age=${60 * 60 * 24 * 365}` : '; max-age=0';
    try {
      document.cookie = `${TIME_ZONE_COOKIE_KEY}=${
        normalized ? encodeURIComponent(normalized) : ''
      }; path=/${expires}`;
    } catch {
      // Ignore cookie write errors.
    }
  }
}

export function clearStoredTimeZone(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.removeItem(TIME_ZONE_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${TIME_ZONE_COOKIE_KEY}=; path=/; max-age=0`;
    } catch {
      // Ignore cookie errors.
    }
  }
}

export function resolveTimeZone(
  preferred?: string | null,
  localeHint?: string | null,
): string {
  const normalizedPreferred = normalizeTimeZoneInternal(preferred, '');
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  const stored = getStoredTimeZone();
  if (stored) {
    return stored;
  }

  const detected = detectTimeZone(localeHint);
  if (detected) {
    return detected;
  }

  return DEFAULT_TIME_ZONE;
}

export function getStoredLocale(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage?.getItem(LOCALE_STORAGE_KEY);
    const normalized = normalizeLocale(raw, '');
    if (normalized) {
      return normalized;
    }
  } catch {
    // Ignore storage errors and fall through to cookie lookup.
  }

  if (typeof document !== 'undefined') {
    try {
      const cookieValue = document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((part) => part.startsWith(`${LOCALE_COOKIE_KEY}=`));
      if (cookieValue) {
        const [, value] = cookieValue.split('=');
        const normalized = normalizeLocale(decodeURIComponent(value ?? ''), '');
        return normalized || null;
      }
    } catch {
      // Ignore cookie parsing failures.
    }
  }

  return null;
}

export function storeLocalePreference(locale: string | null | undefined): void {
  if (typeof window === 'undefined' && typeof document === 'undefined') {
    return;
  }
  const normalized = normalizeLocale(locale, '');

  if (typeof window !== 'undefined') {
    try {
      if (normalized) {
        window.localStorage?.setItem(LOCALE_STORAGE_KEY, normalized);
      } else {
        window.localStorage?.removeItem(LOCALE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors or unavailable localStorage.
    }
  }

  if (typeof document !== 'undefined') {
    const expires = normalized ? `; max-age=${60 * 60 * 24 * 365}` : '; max-age=0';
    try {
      document.cookie = `${LOCALE_COOKIE_KEY}=${
        normalized ? encodeURIComponent(normalized) : ''
      }; path=/${expires}`;
    } catch {
      // Ignore cookie write errors.
    }
  }
}

export function clearStoredLocale(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.removeItem(LOCALE_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${LOCALE_COOKIE_KEY}=; path=/; max-age=0`;
    } catch {
      // Ignore cookie errors.
    }
  }
}

const SAMPLE_DATE = new Date(2001, 10, 21);
const SAMPLE_TIME = new Date(Date.UTC(2001, 10, 21, 9, 0));
const SAMPLE_DISPLAY_MOMENT = new Date(Date.UTC(2025, 8, 25, 12, 30));

export function getDatePlaceholder(
  locale: string | null | undefined,
): string {
  const normalized = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
  const lower = normalized.toLowerCase();
  const isAustralian = lower === 'en-au' || lower.startsWith('en-au-');
  const australianFallback = 'DD/MM/YYYY';

  try {
    const formatter = new Intl.DateTimeFormat(normalized, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(SAMPLE_DATE);
    const placeholderLower = parts
      .map((part) => {
        if (part.type === 'day') return 'dd';
        if (part.type === 'month') return 'mm';
        if (part.type === 'year') return 'yyyy';
        return part.value;
      })
      .join('');

    const monthIndex = placeholderLower.indexOf('mm');
    const dayIndex = placeholderLower.indexOf('dd');
    const dayFirst = dayIndex !== -1 && monthIndex !== -1 && dayIndex < monthIndex;

    if (isAustralian && monthIndex !== -1 && dayIndex !== -1 && monthIndex < dayIndex) {
      return australianFallback;
    }

    if (dayFirst) {
      return 'DD/MM/YYYY';
    }

    return placeholderLower
      .replace(/d/g, 'D')
      .replace(/m/g, 'M')
      .replace(/y/g, 'Y');
  } catch {
    return isAustralian
      ? australianFallback
      : 'YYYY-MM-DD';
  }
}

export function usesTwentyFourHourClock(
  locale: string | null | undefined,
): boolean {
  const normalized = normalizeLocale(locale);
  try {
    const formatter = new Intl.DateTimeFormat(normalized, {
      hour: 'numeric',
      minute: 'numeric',
    });
    const parts = formatter.formatToParts(SAMPLE_TIME);
    return !parts.some((part) => part.type === 'dayPeriod');
  } catch {
    return true;
  }
}

function ensureOptions(
  options: Intl.DateTimeFormatOptions | undefined,
  fallback: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (!options) {
    return fallback;
  }
  if (Object.keys(options).length === 0) {
    return fallback;
  }
  return options;
}

const DATE_TIME_PRESETS = {
  default: { dateStyle: 'medium', timeStyle: 'short' } as const,
  compact: { dateStyle: 'short', timeStyle: 'short' } as const,
};

type DateTimePreset = keyof typeof DATE_TIME_PRESETS;

export function resolveFormatterLocale(
  locale: string | null | undefined,
): string {
  return normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
}

export function resolveFormatterTimeZone(
  preferredTimeZone?: string | null,
): string {
  return resolveTimeZone(preferredTimeZone);
}

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
  preferredTimeZone?: string | null,
): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const normalizedLocale = resolveFormatterLocale(locale);
  const baseOptions = ensureOptions(options, { dateStyle: 'medium' });
  const formatterOptions: Intl.DateTimeFormatOptions = {
    ...baseOptions,
  };
  if (!formatterOptions.timeZone) {
    formatterOptions.timeZone = resolveFormatterTimeZone(preferredTimeZone);
  }
  const localeForFormatter = normalizedLocale || undefined;

  try {
    return new Intl.DateTimeFormat(localeForFormatter, formatterOptions).format(date);
  } catch {
    // Fall through to neutral formatting.
  }

  try {
    return new Intl.DateTimeFormat(NEUTRAL_FALLBACK_LOCALE, formatterOptions).format(date);
  } catch {
    const includesDate =
      'dateStyle' in formatterOptions ||
      formatterOptions.day !== undefined ||
      formatterOptions.month !== undefined ||
      formatterOptions.year !== undefined;
    const includesTime =
      'timeStyle' in formatterOptions ||
      formatterOptions.hour !== undefined ||
      formatterOptions.minute !== undefined ||
      formatterOptions.second !== undefined;

    const parts: string[] = [];
    if (includesDate) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = date
        .toLocaleString(NEUTRAL_FALLBACK_LOCALE, { month: 'short' })
        .replace('.', '');
      const year = date.getFullYear();
      parts.push(`${day} ${month} ${year}`);
    }

    if (includesTime) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timePart = `${hours}:${minutes}`;
      if (parts.length) {
        parts[parts.length - 1] = `${parts[parts.length - 1]}, ${timePart}`;
      } else {
        parts.push(timePart);
      }
    }

    if (!parts.length) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = date
        .toLocaleString(NEUTRAL_FALLBACK_LOCALE, { month: 'short' })
        .replace('.', '');
      const year = date.getFullYear();
      parts.push(`${day} ${month} ${year}`);
    }

    return parts.join(' ');
  }
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions | DateTimePreset = 'default',
  preferredTimeZone?: string | null,
): string {
  const resolvedOptions =
    typeof options === 'string'
      ? DATE_TIME_PRESETS[options]
      : ensureOptions(options, DATE_TIME_PRESETS.default);
  return formatDate(value, locale, resolvedOptions, preferredTimeZone);
}

export function formatTime(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { timeStyle: 'short' },
  preferredTimeZone?: string | null,
): string {
  const resolvedOptions = ensureOptions(options, { timeStyle: 'short' });
  return formatDate(value, locale, resolvedOptions, preferredTimeZone);
}

export function getDateExample(locale: string, preset: DateTimePreset = 'default'): string {
  const options =
    preset === 'default'
      ? { dateStyle: 'medium' as const }
      : { dateStyle: 'short' as const };
  return formatDate(SAMPLE_DISPLAY_MOMENT, locale, options);
}

export function getTimeExample(locale: string): string {
  return formatTime(SAMPLE_TIME, locale);
}
