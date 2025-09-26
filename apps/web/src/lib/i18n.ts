export const NEUTRAL_FALLBACK_LOCALE = 'en-GB';
export const DEFAULT_TIME_ZONE = 'Australia/Melbourne';

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

export function resolveTimeZone(preferred?: string | null): string {
  if (typeof preferred === 'string') {
    const trimmed = preferred.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        return detected;
      }
    } catch {
      // Ignore detection failures and fall through to the default.
    }
  }

  return DEFAULT_TIME_ZONE;
}

export const LOCALE_STORAGE_KEY = 'cst:locale';
export const LOCALE_COOKIE_KEY = 'cst-preferred-locale';

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

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const normalizedLocale = normalizeLocale(locale, '');
  const baseOptions = ensureOptions(options, { dateStyle: 'medium' });
  const formatterOptions: Intl.DateTimeFormatOptions = {
    ...baseOptions,
  };
  if (!formatterOptions.timeZone) {
    formatterOptions.timeZone = resolveTimeZone();
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
): string {
  const resolvedOptions =
    typeof options === 'string'
      ? DATE_TIME_PRESETS[options]
      : ensureOptions(options, DATE_TIME_PRESETS.default);
  return formatDate(value, locale, resolvedOptions);
}

export function formatTime(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { timeStyle: 'short' },
): string {
  const resolvedOptions = ensureOptions(options, { timeStyle: 'short' });
  return formatDate(value, locale, resolvedOptions);
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
