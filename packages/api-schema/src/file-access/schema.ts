import {workspaceSchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

/** Schema for the GET /settings/file-access/workspaces response body. */
export const getWorkspacesResponseSchema = z.object({
  workspaces: z.array(workspaceSchema),
});

export type GetWorkspacesResponse = z.infer<typeof getWorkspacesResponseSchema>;

/** Schema for the PUT /settings/file-access/workspaces request body. */
export const putWorkspacesRequestSchema = z.object({
  workspaces: z.array(workspaceSchema),
});

export type PutWorkspacesRequest = z.infer<typeof putWorkspacesRequestSchema>;

/** Schema for the PUT /settings/file-access/workspaces success response body. */
export const putWorkspacesSuccessResponseSchema = z.object({
  success: z.literal(true),
});

export type PutWorkspacesSuccessResponse = z.infer<
  typeof putWorkspacesSuccessResponseSchema
>;

/** Schema for a single invalid path entry in error responses. */
export const invalidPathEntrySchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export type InvalidPathEntry = z.infer<typeof invalidPathEntrySchema>;

/** Schema for the PUT /settings/file-access/workspaces error response body (422). */
export const invalidPathsResponseSchema = z.object({
  error: z.literal('INVALID_PATHS'),
  invalidPaths: z.array(invalidPathEntrySchema),
});

export type InvalidPathsResponse = z.infer<typeof invalidPathsResponseSchema>;
