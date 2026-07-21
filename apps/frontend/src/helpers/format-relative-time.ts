const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats `updatedAtMs` as a compact relative label against `nowMs`.
 * Buckets: just now (<1m) / {m}m ago / {h}h ago / yesterday (<48h) /
 * {d}d ago (<7d) / local "Mon D" date beyond a week. `now` is injected so
 * the function is pure and deterministic under test.
 */
export function formatRelativeTime(updatedAtMs: number, nowMs: number): string {
  const diff = nowMs - updatedAtMs;
  if (diff < MINUTE) {
    return 'just now';
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)}m ago`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)}h ago`;
  }
  if (diff < 2 * DAY) {
    return 'yesterday';
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)}d ago`;
  }
  const date = new Date(updatedAtMs);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
