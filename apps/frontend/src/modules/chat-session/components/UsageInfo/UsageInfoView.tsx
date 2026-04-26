import type {SseUsage} from '@omnicraft/sse-events';
import clsx from 'clsx';

import {THINKING_LEVEL_LABELS} from '../ThinkingLevelSelect/index.js';
import {formatTokenCount} from './helpers/format-token-count.js';
import styles from './styles.module.css';

interface UsageInfoViewProps {
  usage: SseUsage;
  className?: string;
}

const CONTEXT_WARNING_THRESHOLD = 0.8;

export function UsageInfoView({usage, className}: UsageInfoViewProps) {
  const cacheRate =
    usage.inputTokens > 0
      ? Math.round((usage.cacheReadInputTokens / usage.inputTokens) * 100)
      : 0;

  const contextRatio =
    usage.maxInputTokens > 0 ? usage.inputTokens / usage.maxInputTokens : 0;
  const contextPercent = Math.round(contextRatio * 100);
  const isContextHigh = contextRatio > CONTEXT_WARNING_THRESHOLD;

  return (
    <div className={clsx(styles.container, className)}>
      <span className={styles.item}>{usage.model}</span>
      <span className={styles.item}>
        Thinking: {THINKING_LEVEL_LABELS[usage.thinkingLevel]}
      </span>
      <span className={`${styles.item} ${isContextHigh ? styles.warning : ''}`}>
        Input: {formatTokenCount(usage.inputTokens)} /{' '}
        {formatTokenCount(usage.maxInputTokens)}
        <span className={styles.rate}> ({contextPercent}%)</span>
      </span>
      <span className={styles.item}>
        Output: {formatTokenCount(usage.outputTokens)}
      </span>
      <span className={styles.item}>
        Cached: {formatTokenCount(usage.cacheReadInputTokens)}
        <span className={styles.rate}> ({cacheRate}%)</span>
      </span>
    </div>
  );
}
