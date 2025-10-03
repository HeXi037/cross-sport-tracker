'use client';

import { type ChangeEvent, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from '../lib/LocaleContext';
import {
  loadUserSettings,
  saveUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from '../app/user-settings';
import { normalizeLocale, storeLocalePreference } from '../lib/i18n';

const SELECTABLE_LOCALES = ['en-AU', 'en-GB', 'es-ES'] as const;
type SelectableLocale = (typeof SELECTABLE_LOCALES)[number];

function isSelectableLocale(value: string): value is SelectableLocale {
  return (SELECTABLE_LOCALES as readonly string[]).includes(value);
}

export default function LanguageSelector() {
  const activeLocale = useLocale();
  const t = useTranslations('Header.locale');
  const normalizedActive = normalizeLocale(activeLocale, 'en-GB');
  const selectedLocale: SelectableLocale = isSelectableLocale(normalizedActive)
    ? normalizedActive
    : 'en-GB';

  const options = useMemo(
    () =>
      SELECTABLE_LOCALES.map((locale) => ({
        value: locale,
        label: t(`options.${locale}`),
      })),
    [t],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextValue = event.target.value;
      if (!isSelectableLocale(nextValue) || nextValue === selectedLocale) {
        return;
      }

      try {
        const currentSettings = loadUserSettings();
        saveUserSettings({
          ...currentSettings,
          preferredLocale: nextValue,
        });
      } catch {
        storeLocalePreference(nextValue);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(USER_SETTINGS_CHANGED_EVENT));
        }
      }
    },
    [selectedLocale],
  );

  return (
    <div className="nav-language">
      <label className="nav-language__label">
        <span className="sr-only">{t('label')}</span>
        <select
          aria-label={t('label')}
          className="nav-language__select"
          title={t('label')}
          onChange={handleChange}
          value={selectedLocale}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
