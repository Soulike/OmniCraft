import type {ToolResultBlock} from '../types.js';

/**
 * Projects blocks to a plain-text representation for text-only consumers
 * (compaction, the SSE `result` string, `compactResult` hooks). Media blocks
 * render as placeholders, matching the pre-media `renderContentText` output.
 */
export function toolResultBlocksToText(
  blocks: readonly ToolResultBlock[],
): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.text;
        case 'image':
          return `[image: ${block.mediaType}]`;
        case 'document':
          return `[document: ${block.name ?? 'file'} (${block.mediaType})]`;
      }
    })
    .join('\n');
}
