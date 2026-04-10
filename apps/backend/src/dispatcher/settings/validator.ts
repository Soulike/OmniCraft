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
