import type {ResolvedLlmAttachment, ToolResultBlock} from '../types.js';
import {formatAttachmentSize} from './format-attachment-size.js';

/**
 * Maps resolved attachments to the neutral media blocks both provider adapters
 * already know how to emit. An attachment that could not be delivered becomes
 * a text placeholder rather than being dropped, so the model is told rather
 * than silently left with less than it was promised. The placeholder states
 * whether the file is missing, exceeds the byte budget, or exceeds the image
 * dimension limit so the agent knows which remediation is applicable.
 */
export function attachmentsToBlocks(
  attachments: readonly ResolvedLlmAttachment[],
): ToolResultBlock[] {
  return attachments.map((attachment) => {
    if (attachment.data === null) {
      let text: string;
      switch (attachment.reason) {
        case 'missing':
          text = `[attachment missing: ${attachment.fileName}]`;
          break;
        case 'too-large':
          text = `[attachment too large to deliver: ${attachment.fileName} (${formatAttachmentSize(attachment.lastKnownByteSize)})]`;
          break;
        case 'dimensions-too-large':
          text = `[attachment image dimensions exceed delivery limit: ${attachment.fileName} (maximum ${attachment.maxDimensionPixels.toString()} px per edge)]`;
          break;
      }
      return {type: 'text', text};
    }
    // Exhaustive over every deliverable media type: adding one without a case
    // here is a compile error (missing return), not a silent image fallback.
    switch (attachment.mediaType) {
      case 'application/pdf':
        return {
          type: 'document',
          mediaType: attachment.mediaType,
          data: attachment.data,
          name: attachment.fileName,
        };
      case 'image/png':
      case 'image/jpeg':
      case 'image/gif':
      case 'image/webp':
        return {
          type: 'image',
          mediaType: attachment.mediaType,
          data: attachment.data,
        };
    }
  });
}
