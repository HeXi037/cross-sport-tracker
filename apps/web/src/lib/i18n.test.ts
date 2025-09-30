import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredTimeZone,
  DEFAULT_TIME_ZONE,
  detectTimeZone,
  formatDateTime,
  getStoredTimeZone,
  NEUTRAL_FALLBACK_LOCALE,
  resolveFormatterLocale,
  resolveTimeZone,
  storeTimeZonePreference,
  TIME_ZONE_COOKIE_KEY,
  TIME_ZONE_STORAGE_KEY,
} from './i18n';

describe('time zone resolution', () => {
  afterEach(() => {
    clearStoredTimeZone();
    window.localStorage.clear();
    document.cookie = `${TIME_ZONE_COOKIE_KEY}=; path=/; max-age=0`;
  });

  it('prefers an explicit time zone argument when provided', () => {
    expect(resolveTimeZone('America/New_York')).toBe('America/New_York');
  });

  it('prefers stored preferences before falling back to detection', () => {
    storeTimeZonePreference('Asia/Tokyo');
    expect(window.localStorage.getItem(TIME_ZONE_STORAGE_KEY)).toBe('Asia/Tokyo');
    expect(resolveTimeZone(null)).toBe('Asia/Tokyo');
  });

  it('falls back to UTC when detection is unavailable', () => {
    const spy = vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => {
        throw new Error('no detection');
      });

    expect(resolveTimeZone('')).toBe(DEFAULT_TIME_ZONE);

    spy.mockRestore();
  });

  it('falls back to a locale-associated time zone when detection cannot run', () => {
    const originalWindow = global.window;
    // @ts-expect-error - simulate a non-browser environment where window is unavailable
    delete (global as { window?: typeof window }).window;

    try {
      expect(detectTimeZone('en-AU')).toBe('Australia/Melbourne');
      expect(resolveTimeZone(null, 'en-AU')).toBe('Australia/Melbourne');
    } finally {
      global.window = originalWindow;
    }
  });

  it('ignores invalid stored values', () => {
    storeTimeZonePreference('Invalid/Zone');
    expect(getStoredTimeZone()).toBeNull();
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
  });
});

describe('formatter helpers', () => {
  it('falls back to a neutral locale when no locale is provided', () => {
    expect(resolveFormatterLocale(undefined)).toBe(NEUTRAL_FALLBACK_LOCALE);
    expect(resolveFormatterLocale('')).toBe(NEUTRAL_FALLBACK_LOCALE);
  });

  it('formats dates with the neutral fallback when locale hints are missing', () => {
    expect(formatDateTime('2001-11-21T09:30:00Z', '')).toBe('21 Nov 2001, 09:30');
  });
});
