import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {runCommandTool} from './run-command.js';

describe('runCommandTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'rct-test-')),
    );
    context = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
      shellState: {cwd: tmpDir},
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(runCommandTool.name).toBe('run_command');
  });

  describe('output formatting', () => {
    it('returns "(No output)" for silent successful commands', async () => {
      const result = await runCommandTool.execute({command: 'true'}, context);
      expect(result.content).toBe('(No output)');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.command).toBe('true');
      expect(result.data.exitCode).toBe(0);
    });

    it('includes exit code for failed commands', async () => {
      const result = await runCommandTool.execute(
        {command: 'exit 42'},
        context,
      );
      expect(result.content).toContain('Exit code: 42');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('includes stderr section when present', async () => {
      const result = await runCommandTool.execute(
        {command: 'echo error >&2'},
        context,
      );
      expect(result.content).toContain('(stderr)');
      expect(result.content).toContain('error');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.exitCode).toBe(0);
      expect(result.data.stderr).toBeTruthy();
    });

    it('includes timeout message', async () => {
      const result = await runCommandTool.execute(
        {command: 'sleep 30', timeout: 500},
        context,
      );
      expect(result.content).toContain('Command timed out');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('saves large output to a temp file', async () => {
      const result = await runCommandTool.execute(
        {command: 'head -c 41000 /dev/urandom | base64'},
        context,
      );
      expect(result.content).toContain('Output saved to file:');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.exitCode).toBe(0);
    });
  });

  describe('CWD enforcement', () => {
    it('updates shellState.cwd when directory changes', async () => {
      const subDir = path.join(tmpDir, 'sub');
      await fs.mkdir(subDir);

      await runCommandTool.execute({command: 'cd sub'}, context);
      expect(context.shellState.cwd).toBe(subDir);
    });

    it('reports CWD change in output', async () => {
      const subDir = path.join(tmpDir, 'sub');
      await fs.mkdir(subDir);

      const result = await runCommandTool.execute({command: 'cd sub'}, context);
      expect(result.content).toContain('Working directory:');
      expect(result.content).toContain(subDir);
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.cwd).toBe(subDir);
    });

    it('resets CWD when command navigates outside workingDirectory', async () => {
      const result = await runCommandTool.execute({command: 'cd /'}, context);

      expect(context.shellState.cwd).toBe(tmpDir);
      expect(result.content).toContain('Working directory reset to:');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.cwd).toBe(tmpDir);
    });

    it('uses tracked CWD for subsequent commands', async () => {
      const subDir = path.join(tmpDir, 'sub');
      await fs.mkdir(subDir);

      await runCommandTool.execute({command: 'cd sub'}, context);
      const result = await runCommandTool.execute({command: 'pwd'}, context);
      expect(result.content).toContain(subDir);
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.cwd).toBe(subDir);
    });
  });
});
