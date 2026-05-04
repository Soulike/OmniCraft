import type {SseUsage} from '@omnicraft/sse-events';
import clsx from 'clsx';

import {THINKING_LEVEL_LABELS} from '../../constants.js';
import {formatTokenCount} from './helpers/format-token-count.js';
import styles from './styles.module.css';

interface UsageInfoViewProps {
  usage: SseUsage;
  className?: string;
}

const CONTEXT_WARNING_THRESHOLD = 0.8;

export function UsageInfoView({usage, className}: UsageInfoViewProps) {
  const cacheRate =
    usage.sessionInputTokens > 0
      ? Math.round(
          (usage.sessionCacheReadInputTokens / usage.sessionInputTokens) * 100,
        )
      : 0;

  const contextRatio =
    usage.contextWindowTokens > 0
      ? usage.currentContextInputTokens / usage.contextWindowTokens
      : 0;
  const contextPercent = Math.round(contextRatio * 100);
  const isContextHigh = contextRatio > CONTEXT_WARNING_THRESHOLD;

  return (
    <div className={clsx(styles.container, className)}>
      <span className={styles.item}>{usage.model}</span>
      <span className={styles.item}>
        Thinking: {THINKING_LEVEL_LABELS[usage.thinkingLevel]}
      </span>
      <span className={`${styles.item} ${isContextHigh ? styles.warning : ''}`}>
        Context: {formatTokenCount(usage.currentContextInputTokens)} /{' '}
        {formatTokenCount(usage.contextWindowTokens)}
        <span className={styles.rate}> ({contextPercent}%)</span>
      </span>
      <span className={styles.item}>
        Input: {formatTokenCount(usage.sessionInputTokens)}
      </span>
      <span className={styles.item}>
        Output: {formatTokenCount(usage.sessionOutputTokens)}
      </span>
      <span className={styles.item}>
        Cached: {formatTokenCount(usage.sessionCacheReadInputTokens)}
        <span className={styles.rate}> ({cacheRate}%)</span>
      </span>
    </div>
  );
}
