import type {DocumentMediaType, ImageMediaType} from '@omnicraft/tool-schemas';
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';

/**
 * Narrows a sniffed MIME string to a deliverable media type. Returns `null`
 * when `mime` is missing or is not one of the types this store accepts —
 * that possibility is the whole point of the function, which is why it is
 * not called `toMediaType`.
 */
export function toSupportedMediaType(
  mime: string | undefined,
): ImageMediaType | DocumentMediaType | null {
  if (mime === undefined) return null;
  const image = imageMediaTypeSchema.safeParse(mime);
  if (image.success) return image.data;
  const document = documentMediaTypeSchema.safeParse(mime);
  if (document.success) return document.data;
  return null;
}
