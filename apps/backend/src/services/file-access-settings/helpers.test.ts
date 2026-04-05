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

  it('returns empty errors for valid read-write directory', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([]);
  });

  it('returns empty errors for valid read directory', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
    ]);
    expect(errors).toEqual([]);
  });

  it('returns error for duplicate paths', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
      {path: tempDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: tempDir, reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('normalizes paths before dedup check', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
      {path: tempDir + '/', mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: tempDir + '/', reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('returns normalized paths', async () => {
    const {normalized} = await normalizeAndValidatePaths([
      {path: tempDir + '/', mode: 'read'},
    ]);
    expect(normalized[0].path).toBe(tempDir);
  });

  it('returns normalized paths only for valid entries', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {normalized, errors} = await normalizeAndValidatePaths([
      {path: tempDir + '/', mode: 'read'},
      {path: '/nonexistent', mode: 'read'},
      {path: subDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
    expect(normalized).toEqual([
      {path: tempDir, mode: 'read'},
      {path: subDir, mode: 'read-write'},
    ]);
  });

  it('rejects relative path before normalization', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: 'relative/path', mode: 'read'},
    ]);
    expect(errors).toEqual([
      {path: 'relative/path', reason: PathValidationError.NOT_ABSOLUTE},
    ]);
  });

  it('returns error for non-existent path', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: '/nonexistent/path/xyz', mode: 'read'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent/path/xyz', reason: PathValidationError.NOT_FOUND},
    ]);
  });

  it('returns error for file path (not directory)', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    await fs.writeFile(filePath, 'content');
    const {errors} = await normalizeAndValidatePaths([
      {path: filePath, mode: 'read'},
    ]);
    expect(errors).toEqual([
      {path: filePath, reason: PathValidationError.NOT_DIRECTORY},
    ]);
  });

  it('validates multiple paths and returns errors for invalid ones', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
      {path: '/nonexistent', mode: 'read-write'},
      {path: subDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
  });
});
