import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';
import {z} from 'zod';

const testInnerSchema = z.object({
  name: z.string().default('default-name'),
  count: z.number().default(0),
});

const testSchema = z.object({
  section: testInnerSchema.prefault({}),
});

vi.mock('@omnicraft/settings-schema', () => ({
  settingsSchema: testSchema,
}));

const {SettingsManager} = await import('./settings-manager.js');
const {SettingsWarning} = await import('./types.js');

const DEFAULTS = {section: {name: 'default-name', count: 0}};

describe('SettingsManager', () => {
  let tmpDir: string;

  afterEach(() => {
    SettingsManager.resetInstanceForTesting();

    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });

  function makeTmpDir(): string {
    tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
    fs.mkdirSync(tmpDir, {recursive: true});
    return tmpDir;
  }

  function settingsPath(): string {
    return path.join(makeTmpDir(), 'settings.json');
  }

  describe('isValidLeafPath', () => {
    it('returns false for empty path', () => {
      expect(SettingsManager.isValidLeafPath([])).toBe(false);
    });

    it('returns false for non-leaf object path', () => {
      expect(SettingsManager.isValidLeafPath(['section'])).toBe(false);
    });

    it('returns true for section.name', () => {
      expect(SettingsManager.isValidLeafPath(['section', 'name'])).toBe(true);
    });

    it('returns true for section.count', () => {
      expect(SettingsManager.isValidLeafPath(['section', 'count'])).toBe(true);
    });

    it('returns false for nonexistent top-level key', () => {
      expect(SettingsManager.isValidLeafPath(['nonexistent'])).toBe(false);
    });

    it('returns false for nonexistent nested key', () => {
      expect(SettingsManager.isValidLeafPath(['section', 'nonexistent'])).toBe(
        false,
      );
    });

    it('returns false for path beyond leaf', () => {
      expect(
        SettingsManager.isValidLeafPath(['section', 'name', 'extra']),
      ).toBe(false);
    });
  });

  describe('create', () => {
    it('throws if filePath is not absolute', async () => {
      await expect(
        SettingsManager.create('relative/path.json'),
      ).rejects.toThrow();
    });

    it('creates settings file with defaults when file does not exist', async () => {
      const filePath = settingsPath();
      const {manager, warnings} = await SettingsManager.create(filePath);

      expect(warnings).toEqual([]);
      expect(manager).toBeDefined();

      const content: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toEqual(DEFAULTS);
    });

    it('loads valid existing file without warnings', async () => {
      const filePath = settingsPath();
      const data = {section: {name: 'custom', count: 42}};
      fs.writeFileSync(filePath, JSON.stringify(data));

      const {warnings} = await SettingsManager.create(filePath);
      expect(warnings).toEqual([]);
    });

    it('backs up and resets corrupted JSON file', async () => {
      const filePath = settingsPath();
      const corruptedContent = 'not json{{{}}';
      fs.writeFileSync(filePath, corruptedContent);

      const {warnings} = await SettingsManager.create(filePath);

      expect(warnings).toContain(SettingsWarning.FILE_CORRUPTED);

      const bakPath = `${filePath}.bak`;
      expect(fs.existsSync(bakPath)).toBe(true);
      expect(fs.readFileSync(bakPath, 'utf-8')).toBe(corruptedContent);

      const content: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toEqual(DEFAULTS);
    });

    it('backs up and resets file with schema-invalid data', async () => {
      const filePath = settingsPath();
      const invalidData = {section: {name: 123}};
      fs.writeFileSync(filePath, JSON.stringify(invalidData));

      const {warnings} = await SettingsManager.create(filePath);

      expect(warnings).toContain(SettingsWarning.SCHEMA_INVALID);

      const bakPath = `${filePath}.bak`;
      expect(fs.existsSync(bakPath)).toBe(true);

      const content: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toEqual(DEFAULTS);
    });

    it('throws when called twice', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);

      await expect(SettingsManager.create(filePath)).rejects.toThrow();
    });
  });

  describe('getInstance', () => {
    it('throws before create is called', () => {
      expect(() => SettingsManager.getInstance()).toThrow();
    });

    it('returns the same instance after create', async () => {
      const filePath = settingsPath();
      const {manager} = await SettingsManager.create(filePath);

      expect(SettingsManager.getInstance()).toBe(manager);
    });
  });

  describe('get', () => {
    it('returns default name after fresh create', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(manager.get(['section', 'name'])).resolves.toBe(
        'default-name',
      );
    });

    it('returns default count after fresh create', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(manager.get(['section', 'count'])).resolves.toBe(0);
    });

    it('throws for non-leaf path', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(manager.get(['section'])).rejects.toThrow();
    });

    it('throws for invalid path', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(manager.get(['nonexistent'])).rejects.toThrow();
    });

    it('throws for empty path', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(manager.get([])).rejects.toThrow();
    });
  });

  describe('set', () => {
    it('updates a value and get returns the new value', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await manager.set(['section', 'name'], 'new-name');
      await expect(manager.get(['section', 'name'])).resolves.toBe('new-name');
    });

    it('persists value to file across instances', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await manager.set(['section', 'name'], 'persisted-name');

      // Reset singleton and recreate
      SettingsManager.resetInstanceForTesting();
      const {manager: newManager} = await SettingsManager.create(filePath);

      await expect(newManager.get(['section', 'name'])).resolves.toBe(
        'persisted-name',
      );
    });

    it('throws when setting an object value', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(
        manager.set(['section', 'name'], {foo: 'bar'}),
      ).rejects.toThrow();
    });

    it('throws when setting an array value', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(
        manager.set(['section', 'name'], [1, 2, 3]),
      ).rejects.toThrow();
    });

    it('throws for non-leaf path', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(manager.set(['section'], 'value')).rejects.toThrow();
    });

    it('throws when schema validation fails', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(
        manager.set(['section', 'count'], 'not-a-number'),
      ).rejects.toThrow();
    });
  });

  describe('getAll', () => {
    it('returns defaults after fresh create', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await expect(manager.getAll()).resolves.toEqual(DEFAULTS);
    });

    it('returns updated values after set', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      await manager.set(['section', 'name'], 'updated');
      await manager.set(['section', 'count'], 99);

      await expect(manager.getAll()).resolves.toEqual({
        section: {name: 'updated', count: 99},
      });
    });
  });

  describe('getSchema', () => {
    it('returns a schema with a parse method', async () => {
      const filePath = settingsPath();
      await SettingsManager.create(filePath);
      const manager = SettingsManager.getInstance();

      const schema = manager.getSchema();
      expect(schema).toBeTruthy();
      expect(typeof schema.parse).toBe('function');
    });
  });
});
