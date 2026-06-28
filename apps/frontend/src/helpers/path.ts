/** Removes trailing slashes from a path, preserving a bare root ("/"). */
export function stripTrailingSlash(path: string): string {
  const stripped = path.replace(/\/+$/, '');
  return stripped.length > 0 ? stripped : '/';
}

/** Returns the last segment (directory or file name) of a path. */
export function basename(path: string): string {
  const trimmed = stripTrailingSlash(path);
  const index = trimmed.lastIndexOf('/');
  const name = index >= 0 ? trimmed.slice(index + 1) : trimmed;
  return name.length > 0 ? name : path;
}
