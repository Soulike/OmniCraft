import {useTheme} from '@/hooks/useTheme.js';

import {getNextThemeMode} from './getNextThemeMode.js';
import {ThemeToggleView} from './ThemeToggleView.js';

export function ThemeToggle() {
  const {themeMode, changeThemeMode} = useTheme();

  return (
    <ThemeToggleView
      themeMode={themeMode}
      onCycle={() => {
        changeThemeMode(getNextThemeMode(themeMode));
      }}
    />
  );
}
