import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {SettingsManager} from '@/models/settings-manager/index.js';

import {normalizeAndValidatePaths} from './helpers.js';
import type {InvalidPathEntry} from './types.js';

export type SaveAllowedPathsResult =
  | {success: true}
  | {success: false; invalidPaths: InvalidPathEntry[]};

export const fileAccessSettingsService = {
  async getAllowedPaths(): Promise<readonly AllowedPathEntry[]> {
    const settings = await SettingsManager.getInstance().getAll();
    return settings.fileAccess.allowedPaths;
  },

  async setAllowedPaths(
    entries: AllowedPathEntry[],
  ): Promise<SaveAllowedPathsResult> {
    const {normalized, errors} = await normalizeAndValidatePaths(entries);
    if (errors.length > 0) {
      return {success: false, invalidPaths: errors};
    }

    await SettingsManager.getInstance().set(
      ['fileAccess', 'allowedPaths'],
      normalized,
    );
    return {success: true};
  },
};
