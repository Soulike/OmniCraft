import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/state/file-content-cache.js';
import {toolResultBlocksToText} from '@/agent-core/llm-api/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {runCommandTool} from './run-command.js';

describe('runCommandTool', () => {
  let tmpDir: string;
  let scratchDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'rct-test-')),
    );
    scratchDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'rct-scratch-')),
    );
    context = createMockContext({
      workingDirectory: tmpDir,
      scratchDirectory: scratchDir,
      fileCache: new FileContentCache(),
      shellState: {cwd: tmpDir},
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
    await fs.rm(scratchDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(runCommandTool.name).toBe('run_command');
  });

  describe('output formatting', () => {
    it('returns "(No output)" for silent successful commands', async () => {
      const result = await runCommandTool.execute({command: 'true'}, context);
      expect(toolResultBlocksToText(result.content)).toBe('(No output)');
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
      expect(toolResultBlocksToText(result.content)).toContain('Exit code: 42');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('includes stderr section when present', async () => {
      const result = await runCommandTool.execute(
        {command: 'echo error >&2'},
        context,
      );
      expect(toolResultBlocksToText(result.content)).toContain('(stderr)');
      expect(toolResultBlocksToText(result.content)).toContain('error');
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
      expect(toolResultBlocksToText(result.content)).toContain(
        'Command timed out',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('saves large output to a temp file', async () => {
      const result = await runCommandTool.execute(
        {command: 'head -c 41000 /dev/urandom | base64'},
        context,
      );
      expect(toolResultBlocksToText(result.content)).toContain(
        'Output saved to file:',
      );
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
      expect(toolResultBlocksToText(result.content)).toContain(
        'Working directory:',
      );
      expect(toolResultBlocksToText(result.content)).toContain(subDir);
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.cwd).toBe(subDir);
    });

    it('resets CWD when command navigates outside workingDirectory', async () => {
      const result = await runCommandTool.execute({command: 'cd /'}, context);

      expect(context.shellState.cwd).toBe(tmpDir);
      expect(toolResultBlocksToText(result.content)).toContain(
        'Working directory reset to:',
      );
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.cwd).toBe(tmpDir);
    });

    it('uses tracked CWD for subsequent commands', async () => {
      const subDir = path.join(tmpDir, 'sub');
      await fs.mkdir(subDir);

      await runCommandTool.execute({command: 'cd sub'}, context);
      const result = await runCommandTool.execute({command: 'pwd'}, context);
      expect(toolResultBlocksToText(result.content)).toContain(subDir);
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.cwd).toBe(subDir);
    });

    it('persists cwd when a command navigates into the scratch directory', async () => {
      const result = await runCommandTool.execute(
        {command: `cd ${scratchDir}`},
        context,
      );
      expect(context.shellState.cwd).toBe(scratchDir);
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.cwd).toBe(scratchDir);
    });

    it('resets cwd when a command navigates outside both roots', async () => {
      const outsideDir = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), 'rct-outside-')),
      );

      try {
        const result = await runCommandTool.execute(
          {command: `cd ${outsideDir}`},
          context,
        );
        expect(context.shellState.cwd).toBe(tmpDir);
        expect(toolResultBlocksToText(result.content)).toContain(
          'Working directory reset to:',
        );
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(result.data.cwd).toBe(tmpDir);
      } finally {
        await fs.rm(outsideDir, {recursive: true, force: true});
      }
    });
  });
});
