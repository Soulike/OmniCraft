import {sanitizeUri} from 'micromark-util-sanitize-uri';

/** Protocols allowed for links (a[href]). */
const LINK_PROTOCOLS = /^https?|mailto|tel$/i;

/** Protocols allowed for images (img[src]). */
const IMAGE_PROTOCOLS = /^https?$/i;

/**
 * Sanitizes a URL for use in a link.
 * Returns the sanitized URL, or empty string if the protocol is unsafe.
 */
export function sanitizeLinkUrl(href: string): string {
  return sanitizeUri(href, LINK_PROTOCOLS);
}

/**
 * Sanitizes a URL for use in an image src.
 * Returns the sanitized URL, or empty string if the protocol is unsafe.
 */
export function sanitizeImageUrl(src: string): string {
  return sanitizeUri(src, IMAGE_PROTOCOLS);
}
