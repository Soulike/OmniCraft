import type {ThinkingLevel} from '@omnicraft/settings-schema';

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
};

export const THINKING_LEVELS = Object.entries(THINKING_LEVEL_LABELS) as [
  ThinkingLevel,
  string,
][];
