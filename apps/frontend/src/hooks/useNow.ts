import {useEffect, useState} from 'react';

/** Coarse enough to avoid churn, fine enough for minute-grained "time ago" labels. */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Current wall-clock time (epoch ms) that advances on an interval, so relative
 * "time ago" labels refresh as time passes without a session reload. The clock
 * is read in the state initializer and the interval callback — never during
 * render — so it stays React Compiler-safe (no impurity in the render body).
 */
export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return now;
}
