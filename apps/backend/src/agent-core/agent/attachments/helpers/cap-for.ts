import type {DocumentMediaType, ImageMediaType} from '@omnicraft/tool-schemas';

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
 * `compaction-constants.test.ts`. Enforced by the session services once
 * descriptors are resolved from disk, not from client-supplied numbers.
 */
export const MAX_MESSAGE_ATTACHMENT_BYTES = 12 * 1024 * 1024;

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
