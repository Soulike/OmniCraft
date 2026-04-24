import path from 'node:path';

/** Returns true if `child` is strictly inside `parent` (not equal to it). */
export function isSubPath(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  return resolvedChild.startsWith(resolvedParent + path.sep);
}

/** Returns true if `child` is `parent` itself or strictly inside it. */
export function isSubPathOrSelf(parent: string, child: string): boolean {
  return (
    path.resolve(parent) === path.resolve(child) || isSubPath(parent, child)
  );
}
