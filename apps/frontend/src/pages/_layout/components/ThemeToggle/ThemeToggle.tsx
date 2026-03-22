import {useTheme} from '@/hooks/useTheme.js';

import {ThemeToggleView} from './ThemeToggleView.js';

export function ThemeToggle() {
  const {themeMode, changeThemeMode} = useTheme();

  return (
    <ThemeToggleView
      themeMode={themeMode}
      onThemeModeChange={changeThemeMode}
    />
  );
}
