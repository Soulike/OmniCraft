import {useState} from 'react';

/**
 * Captures the current time once, at mount, via a lazy `useState` initializer.
 * `Date.now()` is impure, so it may not be called directly during render;
 * this keeps the render body pure while still giving `TaskListItem` a
 * baseline "now" to compute its relative time label against.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
