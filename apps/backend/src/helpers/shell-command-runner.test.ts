import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ShellCommandRunner} from './shell-command-runner.js';

/** Helper to run a command and clean up temp files after assertions. */
async function run(
  command: string,
  cwd: string,
  timeout: number,
  signal?: AbortSignal,
) {
  const result = await new ShellCommandRunner(
    command,
    cwd,
    timeout,
    signal,
  ).run();

  const cleanup = () => {
    void fs.unlink(result.stdoutFile);
    void fs.unlink(result.stderrFile);
  };

  return {result, cleanup};
}

describe('ShellCommandRunner', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'scr-test-')),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('captures stdout to a temp file', async () => {
    const {result, cleanup} = await run('echo hello', tmpDir, 10_000);

    const content = await fs.readFile(result.stdoutFile, 'utf-8');
    expect(content).toContain('hello');
    cleanup();
  });

  it('captures stderr to a temp file', async () => {
    const {result, cleanup} = await run('echo error >&2', tmpDir, 10_000);

    const content = await fs.readFile(result.stderrFile, 'utf-8');
    expect(content).toContain('error');
    cleanup();
  });

  it('returns the exit code', async () => {
    const {result, cleanup} = await run('exit 42', tmpDir, 10_000);

    expect(result.exitCode).toBe(42);
    cleanup();
  });

  it('captures CWD via stdout marker', async () => {
    const {result, cleanup} = await run('true', tmpDir, 10_000);

    expect(result.cwd).toBe(tmpDir);
    cleanup();
  });

  it('tracks CWD changes', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.mkdir(subDir);

    const {result, cleanup} = await run('cd sub', tmpDir, 10_000);

    expect(result.cwd).toBe(subDir);
    cleanup();
  });

  it('reports timeout and sets timedOut flag', async () => {
    const {result, cleanup} = await run('sleep 30', tmpDir, 500);

    expect(result.timedOut).toBe(true);
    cleanup();
  });

  it('handles abort signal', async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 200);

    const {result, cleanup} = await run(
      'sleep 30',
      tmpDir,
      10_000,
      controller.signal,
    );

    expect(result.exitCode).not.toBe(0);
    cleanup();
  });

  it('streams large output to temp file', async () => {
    const {result, cleanup} = await run(
      'head -c 41000 /dev/urandom | base64',
      tmpDir,
      10_000,
    );

    const stat = await fs.stat(result.stdoutFile);
    expect(stat.size).toBeGreaterThan(32_768);
    cleanup();
  });
});
