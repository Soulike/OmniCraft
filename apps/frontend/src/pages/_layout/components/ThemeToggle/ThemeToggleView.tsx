import {Button, Tooltip} from '@heroui/react';
import {Monitor, Moon, Sun} from 'lucide-react';
import type {ReactNode} from 'react';

import type {ThemeMode} from '@/contexts/theme/index.js';

const MODE_ICONS: Record<ThemeMode, (props: {size: number}) => ReactNode> = {
  light: (props) => <Sun {...props} />,
  dark: (props) => <Moon {...props} />,
  system: (props) => <Monitor {...props} />,
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
  const renderIcon = MODE_ICONS[themeMode];
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
          {renderIcon({size: 18})}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
