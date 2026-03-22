import {z} from 'zod';

import {
  SettingsManager,
  settingValueSchema,
} from '@/models/settings-manager/index.js';

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
export const putSettingsBody = z.object({
  value: settingValueSchema,
});

/** Schema for the PUT /settings/batch request body. */
export const putSettingsBatchBody = z.object({
  entries: z
    .array(
      z.object({
        path: z.string().min(1),
        value: settingValueSchema,
      }),
    )
    .nonempty(),
});
