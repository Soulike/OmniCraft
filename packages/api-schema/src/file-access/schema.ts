import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

/** Schema for the GET /settings/file-access/allowed-paths response body. */
export const getAllowedPathsResponseSchema = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});

export type GetAllowedPathsResponse = z.infer<
  typeof getAllowedPathsResponseSchema
>;

/** Schema for the PUT /settings/file-access/allowed-paths request body. */
export const putAllowedPathsRequestSchema = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});

export type PutAllowedPathsRequest = z.infer<
  typeof putAllowedPathsRequestSchema
>;

/** Schema for the PUT /settings/file-access/allowed-paths success response body. */
export const putAllowedPathsSuccessResponseSchema = z.object({
  success: z.literal(true),
});

export type PutAllowedPathsSuccessResponse = z.infer<
  typeof putAllowedPathsSuccessResponseSchema
>;

/** Schema for a single invalid path entry in error responses. */
export const invalidPathEntrySchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export type InvalidPathEntry = z.infer<typeof invalidPathEntrySchema>;

/** Schema for the PUT /settings/file-access/allowed-paths error response body (422). */
export const invalidPathsResponseSchema = z.object({
  error: z.literal('INVALID_PATHS'),
  invalidPaths: z.array(invalidPathEntrySchema),
});

export type InvalidPathsResponse = z.infer<typeof invalidPathsResponseSchema>;
