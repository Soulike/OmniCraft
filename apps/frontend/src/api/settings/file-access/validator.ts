import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

export const getAllowedPathsResponse = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});

const invalidPathEntrySchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export type InvalidPathEntry = z.infer<typeof invalidPathEntrySchema>;

export const invalidPathsResponse = z.object({
  error: z.literal('INVALID_PATHS'),
  invalidPaths: z.array(invalidPathEntrySchema),
});

export const putAllowedPathsSuccessResponse = z.object({
  success: z.literal(true),
});
