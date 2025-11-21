'use client';

import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'cst-theme-preference';
const THEME_CLASSES: Theme[] = ['light', 'dark'];

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const readStoredTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (THEME_CLASSES.includes((storedValue as Theme) ?? '')) {
      return storedValue as Theme;
    }
  } catch {
    // Ignore storage access failures.
  }

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') {
    return;
  }

  const className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  const colorScheme = theme === 'dark' ? 'dark' : 'light';
  const targets: (HTMLElement | null)[] = [
    document.documentElement,
    document.body,
  ];

  for (const target of targets) {
    if (!target) continue;
    target.classList.remove('theme-light', 'theme-dark');
    target.classList.add(className);
    target.style.colorScheme = colorScheme;
  }
};

const persistTheme = (theme: Theme) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota errors.
  }
};

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }
      const stored = readStoredTheme();
      setTheme(stored);
    };

    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
