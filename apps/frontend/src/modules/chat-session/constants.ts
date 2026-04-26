import type {ThinkingLevel} from '@omnicraft/api-schema';

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

export const THINKING_LEVELS = Object.entries(THINKING_LEVEL_LABELS) as [
  ThinkingLevel,
  string,
][];
