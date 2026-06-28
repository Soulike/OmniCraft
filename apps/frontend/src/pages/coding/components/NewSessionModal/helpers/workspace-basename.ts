/** Returns the last path segment (directory name) of a workspace path. */
export function workspaceBasename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  const base = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  return base.length > 0 ? base : path;
}
