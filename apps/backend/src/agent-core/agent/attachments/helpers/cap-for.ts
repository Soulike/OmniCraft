import type {DocumentMediaType, ImageMediaType} from '@omnicraft/tool-schemas';

/** Max bytes for an image attachment. Anthropic's own per-image limit is 5 MB,
 *  and image token cost is flat regardless of file size, so a larger cap costs
 *  request bytes rather than tokens. */
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Max bytes for a PDF attachment. Held well under the provider's 32 MB request
 *  limit because PDF token cost scales with page count while our estimate is
 *  flat — see https://github.com/Soulike/OmniCraft/issues/373. */
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** The byte cap that applies to a given deliverable media type. */
export function capFor(mediaType: ImageMediaType | DocumentMediaType): number {
  return mediaType === 'application/pdf'
    ? MAX_DOCUMENT_ATTACHMENT_BYTES
    : MAX_IMAGE_ATTACHMENT_BYTES;
}
