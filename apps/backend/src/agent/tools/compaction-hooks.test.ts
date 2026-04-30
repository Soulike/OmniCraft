import {describe, expect, it} from 'vitest';

import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {runCommandTool} from './bash/run-command.js';
import {findFilesTool} from './file/find-files.js';
import {readFileTool} from './file/read-file.js';
import {searchFilesTool} from './file/search-files.js';
import {dispatchAgentTool} from './sub-agent/dispatch-agent-tool.js';
import {todoAppendTool} from './todo/todo-append.js';
import {todoClearTool} from './todo/todo-clear.js';
import {todoListTool} from './todo/todo-list.js';
import {todoUpdateTool} from './todo/todo-update.js';
import {webFetchTool} from './web/web-fetch.js';
import {webFetchRawTool} from './web/web-fetch-raw.js';
import {webSearchTool} from './web/web-search.js';

const TOOLS_WITH_HOOKS = [
  runCommandTool,
  readFileTool,
  searchFilesTool,
  findFilesTool,
  webFetchTool,
  webFetchRawTool,
  webSearchTool,
  dispatchAgentTool,
  todoListTool,
  todoAppendTool,
  todoUpdateTool,
  todoClearTool,
];

function compact(
  tool: ToolDefinition,
  content: string,
  args = '{}',
): string | null | undefined {
  return tool.compactResult?.({
    content,
    status: 'success',
    toolCall: {callId: 'call-1', toolName: tool.name, arguments: args},
    message: {
      id: 'message-1',
      createdAt: 1,
      role: 'tool',
      callId: 'call-1',
      content,
      status: 'success',
    },
  });
}

describe('tool compaction hooks', () => {
  it('defines compactResult for high-volume built-in tools', () => {
    for (const tool of TOOLS_WITH_HOOKS) {
      expect(tool.compactResult, tool.name).toBeTypeOf('function');
    }
  });

  it('keeps run command metadata and important output lines', () => {
    const result = compact(
      runCommandTool,
      ['verbose output', 'Output saved to file: /tmp/out', 'Exit code: 1'].join(
        '\n',
      ),
      JSON.stringify({command: 'bun test'}),
    );

    expect(result).toContain('run_command success');
    expect(result).toContain('Command: bun test');
    expect(result).toContain('Output saved to file: /tmp/out');
    expect(result).toContain('Exit code: 1');
    expect(result).not.toContain('verbose output');
  });

  it('limits generic line-oriented hooks to concise metadata', () => {
    const content = Array.from(
      {length: 40},
      (_, index) => `line ${(index + 1).toString()}`,
    ).join('\n');

    const result = compact(searchFilesTool, content);

    expect(result?.split('\n')).toHaveLength(22);
    expect(result).toContain('search_files success');
    expect(result).toContain('line 21');
    expect(result).not.toContain('line 22');
  });
});
