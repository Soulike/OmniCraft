import assert from 'node:assert';

/**
 * Navigates a nested object along the given key path and returns the parent
 * of the leaf (i.e., the object containing the last key).
 * @param obj - Root object to navigate.
 * @param keyPath - Path segments (must have at least one element).
 */
export function getParent(
  obj: Record<string, unknown>,
  keyPath: string[],
): Record<string, unknown> {
  let current = obj;
  for (const key of keyPath.slice(0, -1)) {
    const next = current[key];
    assert(typeof next === 'object' && next !== null);
    current = next as Record<string, unknown>;
  }
  return current;
}
