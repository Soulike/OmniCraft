import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {normalizeAndValidatePaths} from './helpers.js';
import {PathValidationError} from './types.js';

describe('normalizeAndValidatePaths', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validate-paths-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true});
  });

  it('returns empty errors for valid directory', async () => {
    const {errors} = await normalizeAndValidatePaths([{path: tempDir}]);
    expect(errors).toEqual([]);
  });

  it('returns error for duplicate paths', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir},
      {path: tempDir},
    ]);
    expect(errors).toEqual([
      {path: tempDir, reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('normalizes paths before dedup check', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir},
      {path: tempDir + '/'},
    ]);
    expect(errors).toEqual([
      {path: tempDir + '/', reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('returns normalized paths', async () => {
    const {normalized} = await normalizeAndValidatePaths([
      {path: tempDir + '/'},
    ]);
    expect(normalized[0].path).toBe(tempDir);
  });

  it('returns normalized paths only for valid entries', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {normalized, errors} = await normalizeAndValidatePaths([
      {path: tempDir + '/'},
      {path: '/nonexistent'},
      {path: subDir},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
    expect(normalized).toEqual([{path: tempDir}, {path: subDir}]);
  });

  it('rejects relative path before normalization', async () => {
    const {errors} = await normalizeAndValidatePaths([{path: 'relative/path'}]);
    expect(errors).toEqual([
      {path: 'relative/path', reason: PathValidationError.NOT_ABSOLUTE},
    ]);
  });

  it('returns error for non-existent path', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: '/nonexistent/path/xyz'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent/path/xyz', reason: PathValidationError.NOT_FOUND},
    ]);
  });

  it('returns error for file path (not directory)', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    await fs.writeFile(filePath, 'content');
    const {errors} = await normalizeAndValidatePaths([{path: filePath}]);
    expect(errors).toEqual([
      {path: filePath, reason: PathValidationError.NOT_DIRECTORY},
    ]);
  });

  it('validates multiple paths and returns errors for invalid ones', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir},
      {path: '/nonexistent'},
      {path: subDir},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
  });

  it('rejects blocked workspace roots', async () => {
    const gitDir = path.join(tempDir, '.git');
    await fs.mkdir(gitDir);

    const {errors} = await normalizeAndValidatePaths([{path: gitDir}]);

    expect(errors).toEqual([
      {path: gitDir, reason: PathValidationError.BLOCKED},
    ]);
  });

  it('allows normal workspaces that contain blocked descendants', async () => {
    await fs.mkdir(path.join(tempDir, '.git'));
    await fs.writeFile(path.join(tempDir, '.env'), 'SECRET=value');

    const {normalized, errors} = await normalizeAndValidatePaths([
      {path: tempDir},
    ]);

    expect(errors).toEqual([]);
    expect(normalized).toEqual([{path: tempDir}]);
  });
});
