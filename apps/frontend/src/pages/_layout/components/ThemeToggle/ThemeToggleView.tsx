import {Button, Tooltip} from '@heroui/react';
import {type LucideIcon, Monitor, Moon, Sun} from 'lucide-react';

import type {ThemeMode} from '@/contexts/theme/index.js';

const MODE_ICONS: Record<ThemeMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const MODE_LABELS: Record<ThemeMode, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'System theme',
};

interface ThemeToggleViewProps {
  themeMode: ThemeMode;
  onCycle: () => void;
}

export function ThemeToggleView({themeMode, onCycle}: ThemeToggleViewProps) {
  const Icon = MODE_ICONS[themeMode];
  const label = `${MODE_LABELS[themeMode]} (click to switch)`;

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size='sm'
          variant='ghost'
          aria-label={label}
          onPress={onCycle}
        >
          <Icon size={18} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
