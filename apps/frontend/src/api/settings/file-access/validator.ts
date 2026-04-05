import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

export const getAllowedPathsResponse = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});

export interface InvalidPathEntry {
  path: string;
  reason: string;
}

export const putAllowedPathsSuccessResponse = z.object({
  success: z.literal(true),
});
