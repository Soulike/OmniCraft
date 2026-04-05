import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {executeCommand} from './helpers.js';

describe('executeCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'exec-test-')),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('captures stdout to a temp file', async () => {
    const result = await executeCommand('echo hello', tmpDir, 10_000);

    const content = await fs.readFile(result.stdoutFile, 'utf-8');
    expect(content).toContain('hello');
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });

  it('captures stderr to a temp file', async () => {
    const result = await executeCommand('echo error >&2', tmpDir, 10_000);

    const content = await fs.readFile(result.stderrFile, 'utf-8');
    expect(content).toContain('error');
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });

  it('returns the exit code', async () => {
    const result = await executeCommand('exit 42', tmpDir, 10_000);

    expect(result.exitCode).toBe(42);
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });

  it('captures CWD via fd 3', async () => {
    const result = await executeCommand('true', tmpDir, 10_000);

    expect(result.cwd).toBe(tmpDir);
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });

  it('tracks CWD changes', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.mkdir(subDir);

    const result = await executeCommand('cd sub', tmpDir, 10_000);

    expect(result.cwd).toBe(subDir);
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });

  it('reports timeout and sets timedOut flag', async () => {
    const result = await executeCommand('sleep 30', tmpDir, 500);

    expect(result.timedOut).toBe(true);
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });

  it('handles abort signal', async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 200);

    const result = await executeCommand(
      'sleep 30',
      tmpDir,
      10_000,
      controller.signal,
    );

    expect(result.exitCode).not.toBe(0);
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });

  it('streams large output to temp file without memory issues', async () => {
    const result = await executeCommand(
      'head -c 41000 /dev/urandom | base64',
      tmpDir,
      10_000,
    );

    const stat = await fs.stat(result.stdoutFile);
    expect(stat.size).toBeGreaterThan(32_768);
    await fs.unlink(result.stdoutFile);
    await fs.unlink(result.stderrFile);
  });
});
