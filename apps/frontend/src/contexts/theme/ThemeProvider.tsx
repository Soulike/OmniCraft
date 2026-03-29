import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';

import {useHljsTheme} from '@/hooks/useHljsTheme.js';
import {useMatchMedia} from '@/hooks/useMatchMedia.js';

import {ThemeContext} from './ThemeContext.js';
import type {ResolvedTheme, ThemeMode} from './types.js';

const STORAGE_KEY = 'theme-mode';

function readStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({children}: ThemeProviderProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredThemeMode);
  const prefersDark = useMatchMedia('(prefers-color-scheme: dark)');

  const resolvedTheme: ResolvedTheme = useMemo(
    () =>
      themeMode === 'system' ? (prefersDark ? 'dark' : 'light') : themeMode,
    [prefersDark, themeMode],
  );

  const changeThemeMode = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('light', 'dark');
    html.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  useHljsTheme(resolvedTheme);

  const value = useMemo(
    () => ({themeMode, resolvedTheme, changeThemeMode}),
    [themeMode, resolvedTheme, changeThemeMode],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
