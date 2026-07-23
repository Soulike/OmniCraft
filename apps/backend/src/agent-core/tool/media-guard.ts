import type {DocumentMediaType, ImageMediaType} from '@omnicraft/tool-schemas';

import type {ToolResultBlock} from '../llm-api/tool-result-block.js';

/** Max decoded media bytes inlined into a tool result (persisted + re-sent each turn). */
export const MAX_INLINE_MEDIA_BYTES = 1 * 1024 * 1024;

interface GuardMediaInput {
  /** Base64-encoded media bytes. */
  readonly data: string;
  readonly mediaType: ImageMediaType | DocumentMediaType;
  readonly name?: string;
}

/**
 * Returns an inline media block when the decoded payload is within the cap, or a
 * placeholder text block when it is oversize. The size check reads the decoded
 * length from the base64 string without allocating a buffer, so an oversized or
 * malicious payload (e.g. from a compromised MCP server) is never fully decoded
 * or written to disk.
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

  if (isImage) {
    return {
      type: 'image',
      mediaType: input.mediaType as ImageMediaType,
      data: input.data,
    };
  }
  return {
    type: 'document',
    mediaType: input.mediaType as DocumentMediaType,
    data: input.data,
    ...(input.name === undefined ? {} : {name: input.name}),
  };
}
