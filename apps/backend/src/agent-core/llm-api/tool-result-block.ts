import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

/**
 * A single block of tool-result content. `data` is base64. The neutral shape both
 * provider adapters map onto their native tool-result content arrays.
 */
export const toolResultBlockSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('text'), text: z.string()}),
  z.object({
    type: z.literal('image'),
    mediaType: imageMediaTypeSchema,
    data: z.string(),
  }),
  z.object({
    type: z.literal('document'),
    mediaType: documentMediaTypeSchema,
    data: z.string(),
    name: z.string().optional(),
  }),
]);

export type ToolResultBlock = z.infer<typeof toolResultBlockSchema>;

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
