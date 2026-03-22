import {z} from 'zod';

import type {SettingsManager} from './settings-manager.js';

/** A scalar setting value (not an object or array). */
export const settingValueSchema = z
  .unknown()
  .refine((v) => typeof v !== 'object' || v === null, {
    message: 'Value must be a scalar, not an object',
  });

export type SettingValue = z.infer<typeof settingValueSchema>;

/** A single setting entry: a leaf key path and a scalar value. */
export const settingEntrySchema = z.object({
  keyPath: z.array(z.string()).nonempty(),
  value: settingValueSchema,
});

export type SettingEntry = z.infer<typeof settingEntrySchema>;

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
