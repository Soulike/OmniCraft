const SAFE_URL_PROTOCOLS = /^https?:|^mailto:|^tel:/i;

/**
 * Checks whether a URL is safe to render as a link or image src.
 * Allows http(s), mailto, tel, fragment links, and root-relative paths.
 * Rejects javascript:, data:, protocol-relative (//), and other schemes.
 */
export function isSafeUrl(href: string): boolean {
  // Fragment links are safe
  if (href.startsWith('#')) {
    return true;
  }
  // Root-relative URLs (but not protocol-relative //example.com)
  if (href.startsWith('/') && !href.startsWith('//')) {
    return true;
  }
  return SAFE_URL_PROTOCOLS.test(href);
}
