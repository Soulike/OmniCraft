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
 * Returns an inline media block when the payload is within the cap, or a
 * placeholder text block when it is oversize. `Buffer.byteLength(..., 'base64')`
 * reads the decoded size from the string length without allocating a buffer, so
 * an oversized or malicious payload (e.g. from a compromised MCP server) is never
 * fully decoded or written to disk. It slightly over-counts MIME-wrapped base64
 * (whitespace is counted), but the cap is a soft budget for snapshot/request
 * size, so a fraction of a percent at the boundary does not matter.
 */
export function guardMedia(input: GuardMediaInput): ToolResultBlock {
  const byteSize = Buffer.byteLength(input.data, 'base64');
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
