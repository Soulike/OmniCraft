import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

export const putAllowedPathsBody = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});
