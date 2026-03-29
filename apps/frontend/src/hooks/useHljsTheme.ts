import lightThemeUrl from 'highlight.js/styles/github.css?url';
import darkThemeUrl from 'highlight.js/styles/github-dark.css?url';
import {useEffect} from 'react';

import type {ResolvedTheme} from '@/contexts/theme/types.js';

const LINK_ID = 'hljs-theme';

const THEME_URLS: Record<ResolvedTheme, string> = {
  light: lightThemeUrl,
  dark: darkThemeUrl,
};

/**
 * Injects a single `<link id="hljs-theme">` into `<head>` for the
 * highlight.js theme matching the given resolved theme.
 */
export function useHljsTheme(resolvedTheme: ResolvedTheme): void {
  useEffect(() => {
    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = THEME_URLS[resolvedTheme];
  }, [resolvedTheme]);
}
