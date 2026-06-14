import type {ThemeMode} from '@/contexts/theme/index.js';

const ORDER: ThemeMode[] = ['light', 'dark', 'system'];

export function getNextThemeMode(current: ThemeMode): ThemeMode {
  const index = ORDER.indexOf(current);
  return ORDER[(index + 1) % ORDER.length];
}
