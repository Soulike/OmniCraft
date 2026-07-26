import type {ResolvedLlmAttachment, ToolResultBlock} from '../types.js';
import {formatAttachmentSize} from './format-attachment-size.js';

/**
 * Maps resolved attachments to the neutral media blocks both provider adapters
 * already know how to emit. An attachment that could not be delivered becomes
 * a text placeholder rather than being dropped, so the model is told rather
 * than silently left with less than it was promised. The placeholder wording
 * distinguishes why: `missing` says so plainly, while `too-large` also states
 * the file's size, because — unlike `missing` — it names a live file the
 * agent can still act on (downsample it with a shell command, then read it
 * again), and the size is what makes that actionable.
 */
export function attachmentsToBlocks(
  attachments: readonly ResolvedLlmAttachment[],
): ToolResultBlock[] {
  return attachments.map((attachment) => {
    if (attachment.data === null) {
      const text =
        attachment.reason === 'too-large'
          ? `[attachment too large to deliver: ${attachment.fileName} (${formatAttachmentSize(attachment.byteSize)})]`
          : `[attachment missing: ${attachment.fileName}]`;
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
