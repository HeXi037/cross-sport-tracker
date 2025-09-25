import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from './LocaleContext';

describe('LocaleProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function LocaleConsumer() {
    const locale = useLocale();
    return <span data-testid="locale-value">{locale}</span>;
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
    expect(localeDisplay).toHaveTextContent('en-AU');
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
    expect(localeDisplay).toHaveTextContent('en-AU');
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
});
