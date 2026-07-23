import type {DocumentMediaType, ImageMediaType} from '@omnicraft/tool-schemas';

import type {ToolResultBlock} from '../llm-api/types.js';

/** Max decoded media bytes inlined into a tool result (persisted + re-sent each turn). */
export const MAX_INLINE_MEDIA_BYTES = 1 * 1024 * 1024;

interface GuardMediaInput {
  /** Base64-encoded media bytes. */
  readonly data: string;
  readonly mediaType: ImageMediaType | DocumentMediaType;
  readonly name?: string;
}

/**
 * Exact decoded byte length of a base64 string, ignoring the whitespace and `=`
 * padding a decoder skips (so MIME-wrapped input is measured correctly). Computed
 * from the character count without allocating the decoded buffer, so an oversized
 * payload is never fully decoded.
 */
function base64DecodedByteLength(base64: string): number {
  let dataChars = 0;
  for (let i = 0; i < base64.length; i++) {
    const code = base64.charCodeAt(i);
    // Skip '=' padding and whitespace (tab, LF, VT, FF, CR, space); every other
    // character is a base64 data character (4 chars -> 3 bytes).
    if (code === 61 || code === 32 || (code >= 9 && code <= 13)) continue;
    dataChars++;
  }
  return Math.floor((dataChars * 3) / 4);
}

/**
 * Returns an inline media block when the decoded payload is within the cap, or a
 * placeholder text block when it is oversize. The size check reads the decoded
 * length from the base64 string without allocating a buffer, so an oversized or
 * malicious payload (e.g. from a compromised MCP server) is never fully decoded
 * or written to disk.
 */
export function guardMedia(input: GuardMediaInput): ToolResultBlock {
  const byteSize = base64DecodedByteLength(input.data);
  const isImage = input.mediaType.startsWith('image/');

  if (byteSize > MAX_INLINE_MEDIA_BYTES) {
    const label = isImage ? 'image' : 'document';
    const sizeMb = (byteSize / 1024 / 1024).toFixed(1);
    return {
      type: 'text',
      text: `[${label} too large (${sizeMb} MB), not delivered]`,
    };
  }

  // Strip any MIME-style base64 whitespace before delivering; providers expect
  // unwrapped base64. Bounded allocation — the payload is within the cap.
  const data = input.data.replace(/\s/g, '');

  if (isImage) {
    return {type: 'image', mediaType: input.mediaType as ImageMediaType, data};
  }
  return {
    type: 'document',
    mediaType: input.mediaType as DocumentMediaType,
    data,
    ...(input.name === undefined ? {} : {name: input.name}),
  };
}
