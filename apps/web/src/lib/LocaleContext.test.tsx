import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale, useTimeZone } from './LocaleContext';
import {
  formatDateTime,
  LOCALE_STORAGE_KEY,
  LOCALE_COOKIE_KEY,
  TIME_ZONE_COOKIE_KEY,
} from './i18n';
import {
  USER_SETTINGS_CHANGED_EVENT,
  USER_SETTINGS_STORAGE_KEY,
} from '../app/user-settings';

describe('LocaleProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.cookie = `${LOCALE_COOKIE_KEY}=; path=/; max-age=0`;
    document.cookie = `${TIME_ZONE_COOKIE_KEY}=; path=/; max-age=0`;
    document.documentElement.lang = '';
  });

  function LocaleConsumer() {
    const locale = useLocale();
    return <span data-testid="locale-value">{locale}</span>;
  }

  function LocaleAndTimeZoneConsumer() {
    const locale = useLocale();
    const timeZone = useTimeZone();
    return (
      <>
        <span data-testid="locale-value">{locale}</span>
        <span data-testid="time-zone-value">{timeZone}</span>
      </>
    );
  }

  it('prefers the primary browser locale when available', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-AU', 'en-US']);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');

    render(
      <LocaleProvider locale="en-US">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    await waitFor(() => {
      expect(localeDisplay).toHaveTextContent('en-AU');
    });
  });

  it('uses the accept-language header when provided', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US']);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');

    render(
      <LocaleProvider locale="en-US" acceptLanguage="en-AU,en;q=0.9">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    await waitFor(() => {
      expect(localeDisplay).toHaveTextContent('en-AU');
    });
  });

  it('prefers a stored locale before falling back', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'sv-SE');
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('');

    render(
      <LocaleProvider locale="en-US" acceptLanguage={null}>
        <LocaleConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('sv-SE');
  });

  it('retains the stored locale when browser hints differ', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'sv-SE');
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-AU', 'en-US']);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');

    render(
      <LocaleProvider locale="en-US" acceptLanguage="en-GB,en;q=0.9">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('sv-SE');
    });

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('sv-SE');
  });

  it('falls back to navigator.language when languages is empty', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-GB');

    render(
      <LocaleProvider locale="en-US">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('en-GB');
  });

  it('falls back to the provided locale when browser values are unavailable', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('');

    render(
      <LocaleProvider locale="fr-FR">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('fr-FR');
  });

  it('falls back to a neutral locale and formats times when no hints exist', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('');

    function LocaleAndDateConsumer() {
      const locale = useLocale();
      const formatted = formatDateTime('2001-11-21T09:30:00Z', locale);
      return (
        <>
          <span data-testid="locale-value">{locale}</span>
          <span data-testid="date-value">{formatted}</span>
        </>
      );
    }

    render(
      <LocaleProvider locale="" acceptLanguage={null}>
        <LocaleAndDateConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('en-GB');

    const dateDisplay = await screen.findByTestId('date-value');
    expect(dateDisplay).toHaveTextContent('21/11/2001, 09:30');
  });

  it('uses Intl resolved locale and time zone when browser hints are unavailable', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('');

    const originalResolvedOptions =
      Intl.DateTimeFormat.prototype.resolvedOptions;

    vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockImplementation(function (...args) {
        const resolved = originalResolvedOptions.apply(this, args as never);
        return {
          ...resolved,
          timeZone: 'Australia/Melbourne',
        };
      });

    render(
      <LocaleProvider locale="en-GB" acceptLanguage={null} timeZone={null}>
        <LocaleAndTimeZoneConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('en-GB');

    const timeZoneDisplay = await screen.findByTestId('time-zone-value');
    expect(timeZoneDisplay).toHaveTextContent('Australia/Melbourne');
  });

  it('updates when the browser language changes', async () => {
    let languages: string[] = ['en-US'];
    vi.spyOn(window.navigator, 'languages', 'get').mockImplementation(() => languages);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');

    render(
      <LocaleProvider locale="en-US">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    await screen.findByTestId('locale-value');
    languages = ['en-GB'];

    await act(async () => {
      window.dispatchEvent(new Event('languagechange'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('locale-value')).toHaveTextContent('en-GB');
    });
  });
  it('prioritizes preferredLocale from user settings over accept-language', async () => {
    window.localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        defaultLeaderboardSport: 'all',
        defaultLeaderboardCountry: '',
        weeklySummaryEmails: true,
        preferredLocale: 'sv-SE',
      }),
    );

    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US']);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');

    render(
      <LocaleProvider locale="en-US" acceptLanguage="en-AU,en;q=0.9">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('sv-SE');
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('sv-SE');
    });
  });

  it('reacts to user settings change events in the same tab', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US']);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');

    render(
      <LocaleProvider locale="en-US">
        <LocaleConsumer />
      </LocaleProvider>,
    );

    const localeDisplay = await screen.findByTestId('locale-value');
    expect(localeDisplay).toHaveTextContent('en-US');

    window.localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        defaultLeaderboardSport: 'all',
        defaultLeaderboardCountry: '',
        weeklySummaryEmails: true,
        preferredLocale: 'en-GB',
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event(USER_SETTINGS_CHANGED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByTestId('locale-value')).toHaveTextContent('en-GB');
      expect(document.documentElement.lang).toBe('en-GB');
    });
  });
});
