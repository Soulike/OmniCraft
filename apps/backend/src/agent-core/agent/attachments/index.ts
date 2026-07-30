export type {
  AttachmentDescriptor,
  ClaimAttachmentsResult,
  OpenedAttachment,
  RemoveAttachmentFailureReason,
  RemoveAttachmentResult,
  SaveAttachmentFailureReason,
  SaveAttachmentResult,
} from './agent-attachment-store.js';
export {agentAttachmentStore} from './agent-attachment-store.js';
export {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  totalAttachmentBytes,
} from './helpers/cap-for.js';
