import type {
  DocumentMediaType,
  ImageMediaType,
  LlmAttachment,
} from '@omnicraft/tool-schemas';

/** Max bytes for an image attachment. Anthropic's own per-image limit is 5 MB,
 *  and image token cost is flat regardless of file size, so a larger cap costs
 *  request bytes rather than tokens. */
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Max bytes for a PDF attachment. Held well under the provider's 32 MB request
 *  limit because PDF token cost scales with page count while our estimate is
 *  flat — see https://github.com/Soulike/OmniCraft/issues/373. */
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * A single message's attachments may not exceed this. Strictly below
 * `COMPACTION_TRIGGER_ATTACHMENT_BYTES` (see `compaction-constants.ts`), and
 * at or above the largest per-file cap below — the relationship is pinned by
 * `compaction-constants.test.ts`. Enforced by `Agent.claimAttachments` once
 * descriptors are resolved from disk, not from client-supplied numbers, and
 * asserted again where turns enter the Agent.
 */
export const MAX_MESSAGE_ATTACHMENT_BYTES = 12 * 1024 * 1024;

/** Persistent attachment storage available to one session. Ten maximum-sized
 *  PDFs fit exactly, so the disk budget can never reject a single legal turn
 *  in an otherwise empty session. */
export const MAX_SESSION_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** Bounds directory entries as well as bytes so tiny valid files cannot trade
 *  byte exhaustion for inode exhaustion. */
export const MAX_SESSION_ATTACHMENT_FILES = 100;

/** Total bytes a set of attachments contributes to one request. */
export function totalAttachmentBytes(
  attachments: readonly LlmAttachment[],
): number {
  return attachments.reduce(
    (total, attachment) => total + attachment.lastKnownByteSize,
    0,
  );
}

/** The byte cap that applies to a given deliverable media type. A `Record`
 *  rather than a boolean check: adding a new media type without a cap here is
 *  a compile error rather than a silent fallback to the image cap. */
const CAP_BY_MEDIA_TYPE: Readonly<
  Record<ImageMediaType | DocumentMediaType, number>
> = {
  'image/png': MAX_IMAGE_ATTACHMENT_BYTES,
  'image/jpeg': MAX_IMAGE_ATTACHMENT_BYTES,
  'image/gif': MAX_IMAGE_ATTACHMENT_BYTES,
  'image/webp': MAX_IMAGE_ATTACHMENT_BYTES,
  'application/pdf': MAX_DOCUMENT_ATTACHMENT_BYTES,
};

/** The byte cap that applies to a given deliverable media type. */
export function capFor(mediaType: ImageMediaType | DocumentMediaType): number {
  return CAP_BY_MEDIA_TYPE[mediaType];
}
