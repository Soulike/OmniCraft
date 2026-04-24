import type {Workspace} from '@omnicraft/settings-schema';

import {SettingsManager} from '@/models/settings-manager/index.js';

import {normalizeAndValidatePaths} from './helpers.js';
import type {InvalidPathEntry} from './types.js';

export type SaveWorkspacesResult =
  | {success: true}
  | {success: false; invalidPaths: InvalidPathEntry[]};

export const fileAccessSettingsService = {
  async getWorkspaces(): Promise<readonly Workspace[]> {
    const settings = await SettingsManager.getInstance().getAll();
    return settings.fileAccess.workspaces;
  },

  async setWorkspaces(entries: Workspace[]): Promise<SaveWorkspacesResult> {
    const {normalized, errors} = await normalizeAndValidatePaths(entries);
    if (errors.length > 0) {
      return {success: false, invalidPaths: errors};
    }

    await SettingsManager.getInstance().set(
      ['fileAccess', 'workspaces'],
      normalized,
    );
    return {success: true};
  },
};
