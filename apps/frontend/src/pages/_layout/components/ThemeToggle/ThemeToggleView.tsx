import {type Key, ToggleButton, ToggleButtonGroup} from '@heroui/react';
import {Monitor, Moon, Sun} from 'lucide-react';

import type {ThemeMode} from '@/contexts/theme/index.js';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

interface ThemeToggleViewProps {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export function ThemeToggleView({
  themeMode,
  onThemeModeChange,
}: ThemeToggleViewProps) {
  return (
    <ToggleButtonGroup
      selectionMode='single'
      disallowEmptySelection
      size='md'
      selectedKeys={new Set([themeMode])}
      onSelectionChange={(keys: Set<Key>) => {
        const key = [...keys][0];
        if (key && THEME_MODES.includes(key as ThemeMode)) {
          onThemeModeChange(key as ThemeMode);
        }
      }}
    >
      <ToggleButton isIconOnly aria-label='Light theme' id='light'>
        <Sun />
      </ToggleButton>
      <ToggleButton isIconOnly aria-label='Dark theme' id='dark'>
        <Moon />
      </ToggleButton>
      <ToggleButton isIconOnly aria-label='System theme' id='system'>
        <Monitor />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
