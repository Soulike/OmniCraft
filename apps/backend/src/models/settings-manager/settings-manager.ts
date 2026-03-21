import assert from 'node:assert';
import {
  access,
  constants,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {type Settings, settingsSchema} from '@omnicraft/settings-schema';
import type {ZodType} from 'zod';

import {fileExists} from '@/helpers/fs.js';
import {hasShape, unwrapSchema} from '@/helpers/zod.js';
import {logger} from '@/logger.js';

import {type SettingsManagerCreateResult, SettingsWarning} from './types.js';

/**
 * Manages reading and writing of settings backed by a JSON file.
 * All values are validated against the settings Zod schema.
 *
 * Use {@link SettingsManager.create} to instantiate.
 */
export class SettingsManager {
  private static instance: SettingsManager | null = null;

  private readonly filePath: string;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Returns the singleton instance.
   * @throws If {@link SettingsManager.create} has not been called yet.
   */
  static getInstance(): SettingsManager {
    assert(
      SettingsManager.instance !== null,
      'SettingsManager has not been created yet',
    );
    return SettingsManager.instance;
  }

  /**
   * Checks whether the given key path is a valid leaf (scalar) node in the schema.
   * @param keyPath - Path segments to check (e.g., `['llm', 'apiKey']`).
   */
  static isValidLeafPath(keyPath: string[]): boolean {
    if (!SettingsManager.isValidPath(keyPath)) {
      return false;
    }

    let current: ZodType = settingsSchema;
    for (const key of keyPath) {
      const unwrapped = unwrapSchema(current);
      // Safe to assert: isValidPath already confirmed shape exists
      assert(hasShape(unwrapped));
      current = unwrapped.shape[key];
    }

    return !hasShape(unwrapSchema(current));
  }

  /**
   * Creates a SettingsManager for the given file path.
   *
   * - If the file does not exist, it is created with default values.
   * - If the file contains invalid JSON, it is backed up and reset to defaults.
   * - If the file contains valid JSON but fails schema validation,
   *   it is backed up and reset to defaults.
   *
   * @param filePath - Absolute path to the settings JSON file.
   * @returns The manager instance and any warnings encountered during initialization.
   */
  static async create(filePath: string): Promise<SettingsManagerCreateResult> {
    assert(path.isAbsolute(filePath), 'filePath must be an absolute path');
    assert(
      SettingsManager.instance === null,
      'SettingsManager has already been created',
    );

    const manager = new SettingsManager(filePath);
    SettingsManager.instance = manager;
    const warnings: SettingsWarning[] = [];

    if (!(await fileExists(filePath))) {
      await manager.save(settingsSchema.parse({}));
      return {manager, warnings};
    }

    await access(filePath, constants.R_OK | constants.W_OK);

    const content = await readFile(filePath, 'utf-8');
    const backupPath = filePath + '.bak';

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (e) {
      logger.warn(
        e,
        'Settings file contains invalid JSON, backing up and resetting to defaults',
      );
      await copyFile(filePath, backupPath);
      await manager.save(settingsSchema.parse({}));
      warnings.push(SettingsWarning.FILE_CORRUPTED);
      return {manager, warnings};
    }

    const result = settingsSchema.safeParse(raw);
    if (result.success) {
      return {manager, warnings};
    }

    logger.warn(
      {issues: result.error.issues},
      'Settings file failed schema validation, backing up and resetting to defaults',
    );
    await copyFile(filePath, backupPath);
    await manager.save(settingsSchema.parse({}));
    warnings.push(SettingsWarning.SCHEMA_INVALID);
    return {manager, warnings};
  }

  /**
   * Reads a scalar value at the given key path.
   * @param keyPath - Path segments to a leaf node (e.g., `['llm', 'apiKey']`).
   * @returns The scalar value at that path.
   * @throws If the path is invalid or does not point to a leaf node.
   */
  async get(keyPath: string[]): Promise<unknown> {
    assert(
      SettingsManager.isValidLeafPath(keyPath),
      `Invalid leaf path: [${keyPath.join(', ')}]`,
    );

    const settings = await this.load();
    let current: unknown = settings;
    for (const key of keyPath) {
      assert(typeof current === 'object' && current !== null);
      current = (current as Record<string, unknown>)[key];
    }
    assert(
      typeof current !== 'object' || current === null,
      'Expected a scalar value',
    );
    return current;
  }

  /**
   * Writes a scalar value at the given key path.
   * @param keyPath - Path segments to a leaf node (e.g., `['llm', 'apiKey']`).
   * @param value - The scalar value to set.
   * @throws If the path is invalid, does not point to a leaf, or the value is not a scalar.
   */
  async set(keyPath: string[], value: unknown): Promise<void> {
    assert(
      SettingsManager.isValidLeafPath(keyPath),
      `Invalid leaf path: [${keyPath.join(', ')}]`,
    );
    assert(
      typeof value !== 'object' || value === null,
      'Value must be a scalar, not an object',
    );

    const settings = await this.load();
    let current: Record<string, unknown> = settings;

    for (const key of keyPath.slice(0, -1)) {
      const next = current[key];
      assert(typeof next === 'object' && next !== null);
      current = next as Record<string, unknown>;
    }

    const leafKey = keyPath[keyPath.length - 1];
    current[leafKey] = value;

    const validated = settingsSchema.parse(settings);
    await this.save(validated);
  }

  /** Returns the complete settings object with all defaults applied. */
  async getAll(): Promise<Settings> {
    return this.load();
  }

  /** Returns the Zod schema describing the settings structure. */
  getSchema(): typeof settingsSchema {
    return settingsSchema;
  }

  private async load(): Promise<Settings> {
    const raw: unknown = JSON.parse(await readFile(this.filePath, 'utf-8'));
    return settingsSchema.parse(raw);
  }

  private async save(settings: Settings): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, {recursive: true});
    await writeFile(this.filePath, JSON.stringify(settings, null, 2) + '\n');
  }

  private static isValidPath(keyPath: string[]): boolean {
    if (keyPath.length === 0) {
      return false;
    }

    let current: ZodType = settingsSchema;
    for (const key of keyPath) {
      const unwrapped = unwrapSchema(current);
      if (!hasShape(unwrapped)) {
        return false;
      }
      if (!(key in unwrapped.shape)) {
        return false;
      }
      current = unwrapped.shape[key];
    }
    return true;
  }
}
