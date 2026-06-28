/**
 * Normalizes a workspace path for bucket-key comparison: strips a single
 * trailing slash while preserving the root path ("/").
 */
export function normalizeWorkspacePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}
