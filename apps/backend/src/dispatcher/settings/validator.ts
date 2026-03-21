import {z} from 'zod';

import {SettingsManager} from '@/models/settings-manager/index.js';

/** Parses a raw path string into a validated leaf key path. */
export function parseLeafKeyPath(rawPath: string): string[] {
  const keyPath = rawPath.split('/');
  if (!SettingsManager.isValidLeafPath(keyPath)) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: keyPath,
        message: `Invalid leaf path: /${rawPath}`,
      },
    ]);
  }
  return keyPath;
}

/** Schema for the PUT /settings/* request body. */
export const putSettingsBody = z
  .object({
    value: z.unknown(),
  })
  .refine((body) => typeof body.value !== 'object' || body.value === null, {
    message: 'Value must be a scalar, not an object',
  });
