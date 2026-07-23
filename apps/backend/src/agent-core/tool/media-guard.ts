import type {DocumentMediaType, ImageMediaType} from '@omnicraft/tool-schemas';

import {writeBufferToTempFile} from '@/helpers/fs.js';

import type {ToolResultBlock} from '../llm-api/tool-result-block.js';

/** Max decoded media bytes inlined into a tool result (persisted + re-sent each turn). */
export const MAX_INLINE_MEDIA_BYTES = 1 * 1024 * 1024;

const MEDIA_TYPE_EXTENSION: Record<ImageMediaType | DocumentMediaType, string> =
  {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };

interface GuardMediaInput {
  /** Base64-encoded media bytes. */
  readonly data: string;
  readonly mediaType: ImageMediaType | DocumentMediaType;
  readonly name?: string;
  /** Directory oversize media spills to. */
  readonly scratchDirectory: string;
}

/**
 * Returns an inline media block when the decoded bytes are within the cap, or spills
 * to a scratch file and returns a text block with the path when oversize.
 */
export async function guardMedia(
  input: GuardMediaInput,
): Promise<ToolResultBlock> {
  const buffer = Buffer.from(input.data, 'base64');
  const isImage = input.mediaType.startsWith('image/');

  if (buffer.length <= MAX_INLINE_MEDIA_BYTES) {
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

  const spilledPath = await writeBufferToTempFile(
    buffer,
    MEDIA_TYPE_EXTENSION[input.mediaType],
    input.scratchDirectory,
  );
  const label = isImage ? 'image' : 'document';
  const sizeMb = (buffer.length / 1024 / 1024).toFixed(1);
  return {
    type: 'text',
    text: `[${label} too large (${sizeMb} MB), saved to ${spilledPath}]`,
  };
}
