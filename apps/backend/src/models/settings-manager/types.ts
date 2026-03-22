import type {SettingsManager} from './settings-manager.js';

/** Warnings that may occur during {@link SettingsManager.create}. */
export enum SettingsWarning {
  /** The settings file contained invalid JSON and was backed up and reset. */
  FILE_CORRUPTED = 'FILE_CORRUPTED',
  /** The settings file had fields that failed schema validation and was backed up and reset to default settings. */
  SCHEMA_INVALID = 'SCHEMA_INVALID',
}

/** Result returned by {@link SettingsManager.create}. */
export interface SettingsManagerCreateResult {
  manager: SettingsManager;
  warnings: SettingsWarning[];
}
