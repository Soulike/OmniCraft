import type {ToolName} from '@omnicraft/tool-schemas';
import {describe, expect, it} from 'vitest';

import {getToolPillContent} from './getToolPillContent.js';
import type {ToolExecutionPillContent} from './types.js';

interface TestCase {
  toolName: ToolName;
  toolArguments: string;
  expected: ToolExecutionPillContent;
}

describe('getToolPillContent', () => {
  it.each<TestCase>([
    {
      toolName: 'read_file',
      toolArguments: JSON.stringify({
        filePath: 'src/index.ts',
        startLine: 10,
        lineCount: 5,
      }),
      expected: {
        target: 'src/index.ts',
        targetKind: 'code',
        detail: 'lines 10-14',
      },
    },
    {
      toolName: 'write_file',
      toolArguments: JSON.stringify({
        filePath: 'src/new.ts',
        content: 'export {};',
      }),
      expected: {target: 'src/new.ts', targetKind: 'code', detail: null},
    },
    {
      toolName: 'edit_file',
      toolArguments: JSON.stringify({
        filePath: 'src/edit.ts',
        oldString: 'old',
        newString: 'new',
        replaceAll: true,
      }),
      expected: {
        target: 'src/edit.ts',
        targetKind: 'code',
        detail: 'replace all',
      },
    },
    {
      toolName: 'find_files',
      toolArguments: JSON.stringify({
        pattern: '**/*.ts',
        path: 'src',
      }),
      expected: {target: '**/*.ts', targetKind: 'code', detail: 'src'},
    },
    {
      toolName: 'search_files',
      toolArguments: JSON.stringify({
        pattern: 'getToolPillContent',
        path: 'src',
        filePattern: '**/*.ts',
      }),
      expected: {
        target: 'getToolPillContent',
        targetKind: 'code',
        detail: '**/*.ts',
      },
    },
    {
      toolName: 'run_command',
      toolArguments: JSON.stringify({
        command: 'bun test',
        timeout: 30000,
      }),
      expected: {target: 'bun test', targetKind: 'code', detail: '30s timeout'},
    },
    {
      toolName: 'web_search',
      toolArguments: JSON.stringify({
        query: 'Vite Vitest TypeScript',
        maxResults: 8,
      }),
      expected: {
        target: 'Vite Vitest TypeScript',
        targetKind: 'text',
        detail: 'max 8',
      },
    },
    {
      toolName: 'web_fetch',
      toolArguments: JSON.stringify({
        url: 'https://example.com/docs',
        includeFullPage: true,
      }),
      expected: {
        target: 'https://example.com/docs',
        targetKind: 'code',
        detail: 'full page',
      },
    },
    {
      toolName: 'web_fetch_raw',
      toolArguments: JSON.stringify({url: 'https://example.com/raw'}),
      expected: {
        target: 'https://example.com/raw',
        targetKind: 'code',
        detail: null,
      },
    },
    {
      toolName: 'load_skill',
      toolArguments: JSON.stringify({name: 'test-driven-development'}),
      expected: {
        target: 'test-driven-development',
        targetKind: 'text',
        detail: null,
      },
    },
    {
      toolName: 'get_current_time',
      toolArguments: JSON.stringify({}),
      expected: {target: 'current time', targetKind: 'text', detail: null},
    },
  ])(
    'returns pill content for $toolName',
    ({toolName, toolArguments, expected}) => {
      expect(getToolPillContent({toolName, toolArguments})).toEqual(expected);
    },
  );

  it('returns fallback pill content for malformed JSON', () => {
    expect(
      getToolPillContent({toolName: 'run_command', toolArguments: '{'}),
    ).toEqual({target: 'run_command', targetKind: 'code', detail: null});
  });

  it('returns fallback pill content for adapter validation errors', () => {
    expect(
      getToolPillContent({
        toolName: 'read_file',
        toolArguments: JSON.stringify({startLine: 1}),
      }),
    ).toEqual({target: 'read_file', targetKind: 'code', detail: null});
  });
});
