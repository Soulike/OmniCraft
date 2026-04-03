/**
 * Validates a URL for use by web tools.
 * Returns an error message string if invalid, or undefined if valid.
 */
export function validateUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Error: Invalid URL: ${url}`;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Error: Unsupported URL protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  return undefined;
}
