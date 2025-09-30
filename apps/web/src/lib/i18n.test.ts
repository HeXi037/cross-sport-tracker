import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectTimeZone,
  formatDate,
  formatDateTime,
  getPreferredDateOptions,
} from './i18n';

const ORIGINAL_DATE_TIME_FORMAT = Intl.DateTimeFormat;

function mockDateTimeFormat(timeZone: string | undefined) {
  return vi
    .spyOn(Intl, 'DateTimeFormat')
    .mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone }),
        } as unknown as Intl.DateTimeFormat),
    );
}

describe('detectTimeZone', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {} as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Intl.DateTimeFormat = ORIGINAL_DATE_TIME_FORMAT;
  });

  it('prefers the locale hint when the browser reports UTC', () => {
    mockDateTimeFormat('UTC');

    const zone = detectTimeZone('en-AU');

    expect(zone).toBe('Australia/Melbourne');
  });

  it('prefers the locale hint when the browser reports GMT', () => {
    mockDateTimeFormat('GMT');

    const zone = detectTimeZone('en-AU');

    expect(zone).toBe('Australia/Melbourne');
  });

  it('returns the detected zone when it is specific', () => {
    mockDateTimeFormat('America/Los_Angeles');

    const zone = detectTimeZone('en-US');

    expect(zone).toBe('America/Los_Angeles');
  });
});

describe('getPreferredDateOptions', () => {
  it('selects short date style for Australian English', () => {
    expect(getPreferredDateOptions('en-AU')).toEqual({ dateStyle: 'short' });
  });

  it('keeps medium date style for US English', () => {
    expect(getPreferredDateOptions('en-US')).toEqual({ dateStyle: 'medium' });
  });
});

describe('formatting helpers', () => {
  it('formats dates using day-first ordering for Australian locales', () => {
    const formatted = formatDate(
      new Date('2024-02-03T00:00:00Z'),
      'en-AU',
      undefined,
      'Australia/Melbourne',
    );

    expect(formatted).toContain('3/2/24');
  });

  it('preserves month-first ordering for US locales', () => {
    const formatted = formatDate(
      new Date('2024-02-03T00:00:00Z'),
      'en-US',
      undefined,
      'America/New_York',
    );

    expect(formatted).toContain('Feb 2, 2024');
  });

  it('applies preferred options when formatting date time presets', () => {
    const formatted = formatDateTime(
      new Date('2024-02-03T00:00:00Z'),
      'en-AU',
      'default',
      'Australia/Melbourne',
    );

    expect(formatted).toMatch(/3\/2\/24/);
  });
});
