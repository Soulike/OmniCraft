import type {SseUsage} from '@omnicraft/sse-events';

import {formatTokenCount} from './helpers/format-token-count.js';
import styles from './styles.module.css';

interface UsageInfoProps {
  usage: SseUsage;
}

export function UsageInfo({usage}: UsageInfoProps) {
  const cacheRate =
    usage.inputTokens > 0
      ? Math.round((usage.cacheReadInputTokens / usage.inputTokens) * 100)
      : 0;

  return (
    <div className={styles.container}>
      <span className={styles.item}>
        Input: {formatTokenCount(usage.inputTokens)}
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
