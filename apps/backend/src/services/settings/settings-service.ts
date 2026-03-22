import type {Settings} from '@omnicraft/settings-schema';
import {z} from 'zod';

import {SettingsManager} from '@/models/settings-manager/index.js';

/** Service layer for settings operations. */
export const settingsService = {
  /** Returns the settings structure as a JSON Schema. */
  getJSONSchema() {
    return z.toJSONSchema(SettingsManager.getInstance().getSchema());
  },

  /** Returns the complete settings object with all defaults applied. */
  async getAll(): Promise<Settings> {
    return SettingsManager.getInstance().getAll();
  },

  /**
   * Reads a scalar value at the given key path.
   * @param keyPath - Path segments to a leaf node (e.g., `['llm', 'apiKey']`).
   */
  async get(keyPath: string[]): Promise<unknown> {
    return SettingsManager.getInstance().get(keyPath);
  },

  /**
   * Writes a scalar value at the given key path.
   * @param keyPath - Path segments to a leaf node (e.g., `['llm', 'apiKey']`).
   * @param value - The scalar value to set.
   */
  async set(keyPath: string[], value: unknown): Promise<void> {
    await SettingsManager.getInstance().set(keyPath, value);
  },

  /**
   * Atomically writes multiple scalar values.
   * Converts slash-separated path strings to key path arrays.
   * @param entries - Array of `{path, value}` pairs where `path` is slash-separated (e.g., `'llm/apiKey'`).
   */
  async setBatch(
    entries: {path: string; value: unknown}[],
  ): Promise<void> {
    const updates = entries.map(({path, value}) => ({
      keyPath: path.split('/'),
      value,
    }));
    await SettingsManager.getInstance().setBatch(updates);
  },

  /**
   * Checks whether the given key path is a valid leaf (scalar) node.
   * @param keyPath - Path segments to check.
   */
  isValidLeafPath(keyPath: string[]): boolean {
    return SettingsManager.isValidLeafPath(keyPath);
  },
};
