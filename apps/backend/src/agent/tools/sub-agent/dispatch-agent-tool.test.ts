import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {dispatchAgentTool} from './dispatch-agent-tool.js';

describe('dispatchAgentTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dispatch-agent-test-'));
    context = createMockContext({workingDirectory: tmpDir});
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(dispatchAgentTool.name).toBe('dispatch_agent');
  });

  describe('workingDirectory boundary check', () => {
    it('rejects an absolute path outside the parent working directory', async () => {
      const outside = await fs.mkdtemp(
        path.join(os.tmpdir(), 'dispatch-agent-outside-'),
      );
      try {
        const result = await dispatchAgentTool.execute(
          {task: 't', workingDirectory: outside},
          context,
        );

        expect(result.status).toBe('failure');
        expect(result.content).toContain(
          `is outside the parent agent's working directory`,
        );
      } finally {
        await fs.rm(outside, {recursive: true, force: true});
      }
    });

    it('rejects a relative path that escapes via ..', async () => {
      const result = await dispatchAgentTool.execute(
        {task: 't', workingDirectory: '../escape'},
        context,
      );

      expect(result.status).toBe('failure');
      expect(result.content).toContain(
        `is outside the parent agent's working directory`,
      );
    });

    it('rejects a sibling path with a shared prefix', async () => {
      // Guards against the classic `/a/b` vs `/a/bc` prefix-trick.
      const sibling = `${tmpDir}-sibling`;
      await fs.mkdir(sibling);
      try {
        const result = await dispatchAgentTool.execute(
          {task: 't', workingDirectory: sibling},
          context,
        );

        expect(result.status).toBe('failure');
        expect(result.content).toContain(
          `is outside the parent agent's working directory`,
        );
      } finally {
        await fs.rm(sibling, {recursive: true, force: true});
      }
    });
  });
});
