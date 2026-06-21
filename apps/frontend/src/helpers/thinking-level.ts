import type {ThinkingLevel} from '@omnicraft/api-schema';

const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

/** Display label for a thinking level. Single source of truth for all UI. */
export function getThinkingLevelLabel(level: ThinkingLevel): string {
  return THINKING_LEVEL_LABELS[level];
}

/** All thinking levels as [level, label] pairs, in display order. For
 *  rendering selectable lists. */
export function getThinkingLevelOptions(): readonly [ThinkingLevel, string][] {
  return Object.entries(THINKING_LEVEL_LABELS) as [ThinkingLevel, string][];
}
