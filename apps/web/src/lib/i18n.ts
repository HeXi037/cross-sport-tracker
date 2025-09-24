export function parseAcceptLanguage(
  header: string | null | undefined,
  defaultLocale = 'en-US',
): string {
  if (!header) return defaultLocale;
  const locales = header
    .split(',')
    .map((part) => part.trim().split(';')[0])
    .filter(Boolean);
  return locales[0] ?? defaultLocale;
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
