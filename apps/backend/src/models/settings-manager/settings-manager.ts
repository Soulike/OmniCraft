import assert from 'node:assert';
import {
  access,
  constants,
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {type Settings, settingsSchema} from '@omnicraft/settings-schema';

import {AsyncQueue} from '@/helpers/async-queue.js';
import {fileExists} from '@/helpers/fs.js';
import {getParent} from '@/helpers/object.js';
import {isLeafSchemaPath} from '@/helpers/zod.js';
import {logger} from '@/logger.js';

import {
  type SettingEntry,
  type SettingsManagerCreateResult,
  SettingsWarning,
} from './types.js';

/**
 * Manages reading and writing of settings backed by a JSON file.
 * All values are validated against the settings Zod schema.
 *
 * All read and write operations are serialized through an internal queue
 * to prevent race conditions from concurrent access to the file.
 *
 * Use {@link SettingsManager.create} to instantiate.
 */
export class SettingsManager {
  private static instance: SettingsManager | null = null;

  private readonly filePath: string;
  private readonly ioQueue = new AsyncQueue();

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

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstanceForTesting(): void {
    SettingsManager.instance = null;
  }

  /**
   * Checks whether the given key path is a valid leaf (scalar) node in the schema.
   * @param keyPath - Path segments to check (e.g., `['llm', 'apiKey']`).
   */
  static isValidLeafPath(keyPath: string[]): boolean {
    return isLeafSchemaPath(settingsSchema, keyPath);
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

    const result = await SettingsManager.init(filePath);
    SettingsManager.instance = result.manager;
    return result;
  }

  private static async init(
    filePath: string,
  ): Promise<SettingsManagerCreateResult> {
    const manager = new SettingsManager(filePath);
    const warnings: SettingsWarning[] = [];

    if (!(await fileExists(filePath))) {
      await manager.save(settingsSchema.parse({}));
      return {manager, warnings};
    }

    await access(filePath, constants.R_OK | constants.W_OK);

    const content = await readFile(filePath, 'utf-8');
    const backupPath = `${filePath}.${Date.now().toString()}.bak`;

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

    return this.ioQueue.enqueue(async () => {
      const settings = await this.load();
      const parent = getParent(settings, keyPath);
      const leafKey = keyPath[keyPath.length - 1];
      return parent[leafKey];
    });
  }

  /**
   * Writes a scalar value at the given key path.
   * @param keyPath - Path segments to a leaf node (e.g., `['llm', 'apiKey']`).
   * @param value - The scalar value to set.
   * @throws If the path is invalid, does not point to a leaf, or the value is not a scalar.
   */
  async set(keyPath: string[], value: unknown): Promise<void> {
    await this.setBatch([{keyPath, value}]);
  }

  /**
   * Atomically writes multiple scalar values.
   * All updates are applied in a single I/O operation: if any update
   * fails validation, none of the changes are persisted.
   * @param updates - Array of key path and value pairs to set.
   * @throws If any path is invalid, does not point to a leaf, or a value is not scalar.
   */
  async setBatch(updates: SettingEntry[]): Promise<void> {
    for (const {keyPath} of updates) {
      assert(
        SettingsManager.isValidLeafPath(keyPath),
        `Invalid leaf path: [${keyPath.join(', ')}]`,
      );
    }

    await this.ioQueue.enqueue(async () => {
      const settings = await this.load();

      for (const {keyPath, value} of updates) {
        const parent = getParent(settings, keyPath);
        const leafKey = keyPath[keyPath.length - 1];
        parent[leafKey] = value;
      }

      const validated = settingsSchema.parse(settings);
      await this.save(validated);
    });
  }

  /** Returns the complete settings object with all defaults applied. */
  async getAll(): Promise<Settings> {
    return this.ioQueue.enqueue(() => this.load());
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
    const tmpPath = this.filePath + '.tmp';
    await writeFile(tmpPath, JSON.stringify(settings, null, 2) + '\n');
    await rename(tmpPath, this.filePath);
  }
}
