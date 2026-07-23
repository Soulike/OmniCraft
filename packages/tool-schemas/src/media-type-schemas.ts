import {z} from 'zod';

/**
 * Image MIME types deliverable to both providers. This is the binding-constraint
 * set (Anthropic's Base64ImageSource union); OpenAI takes a data URL so it does not
 * constrain further. Deliberately NOT a bare string and NOT a general MIME package.
 */
export const imageMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
export type ImageMediaType = z.infer<typeof imageMediaTypeSchema>;

/** The only document type deliverable to both providers. */
export const documentMediaTypeSchema = z.literal('application/pdf');
export type DocumentMediaType = z.infer<typeof documentMediaTypeSchema>;
