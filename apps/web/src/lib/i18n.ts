type LocalePreference = {
  locale: string;
  quality: number;
  order: number;
};

export function parseAcceptLanguage(
  header: string | null | undefined,
  defaultLocale = 'en-US',
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
  fallback = 'en-US',
): string {
  return typeof locale === 'string' && locale.length > 0 ? locale : fallback;
}

const SAMPLE_DATE = new Date(2001, 10, 21);

export function getDatePlaceholder(
  locale: string | null | undefined,
): string {
  const normalized = normalizeLocale(locale);
  const lower = normalized.toLowerCase();
  const isAustralian = lower === 'en-au' || lower.startsWith('en-au-');
  const australianFallback = 'dd/mm/yyyy';

  try {
    const formatter = new Intl.DateTimeFormat(normalized, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(SAMPLE_DATE);
    const placeholder = parts
      .map((part) => {
        if (part.type === 'day') return 'dd';
        if (part.type === 'month') return 'mm';
        if (part.type === 'year') return 'yyyy';
        return part.value;
      })
      .join('');

    if (isAustralian) {
      const monthIndex = placeholder.indexOf('mm');
      const dayIndex = placeholder.indexOf('dd');
      if (monthIndex !== -1 && dayIndex !== -1 && monthIndex < dayIndex) {
        return australianFallback;
      }
    }

    return placeholder;
  } catch {
    return isAustralian ? australianFallback : 'yyyy-mm-dd';
  }
}

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
): string {
  return formatDate(value, locale, options);
}
