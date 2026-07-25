import type {ResolvedLlmAttachment, ToolResultBlock} from '../types.js';

/**
 * Maps resolved attachments to the neutral media blocks both provider adapters
 * already know how to emit. An attachment whose file has gone missing becomes a
 * text placeholder rather than being dropped, so the model is told rather than
 * silently left with less than it was promised.
 */
export function attachmentsToBlocks(
  attachments: readonly ResolvedLlmAttachment[],
): ToolResultBlock[] {
  return attachments.map((attachment) => {
    if (attachment.data === null) {
      return {
        type: 'text',
        text: `[attachment missing: ${attachment.fileName}]`,
      };
    }
    if (attachment.mediaType === 'application/pdf') {
      return {
        type: 'document',
        mediaType: attachment.mediaType,
        data: attachment.data,
        name: attachment.fileName,
      };
    }
    return {
      type: 'image',
      mediaType: attachment.mediaType,
      data: attachment.data,
    };
  });
}
