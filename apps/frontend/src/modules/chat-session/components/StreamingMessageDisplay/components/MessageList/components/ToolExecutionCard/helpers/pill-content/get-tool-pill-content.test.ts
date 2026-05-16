import type {ToolName} from '@omnicraft/tool-schemas';
import {describe, expect, it} from 'vitest';

import {getToolPillContent} from './get-tool-pill-content.js';
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
        target: 'index.ts',
        targetKind: 'code',
      },
    },
    {
      toolName: 'write_file',
      toolArguments: JSON.stringify({
        filePath: 'src/new.ts',
        content: 'export {};',
      }),
      expected: {target: 'new.ts', targetKind: 'code'},
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
        target: 'edit.ts',
        targetKind: 'code',
      },
    },
    {
      toolName: 'read_file',
      toolArguments: JSON.stringify({
        filePath: String.raw`C:\project\src\App.tsx`,
      }),
      expected: {
        target: 'App.tsx',
        targetKind: 'code',
      },
    },
    {
      toolName: 'find_files',
      toolArguments: JSON.stringify({
        pattern: '**/*.ts',
        path: 'src',
      }),
      expected: {target: '**/*.ts', targetKind: 'code'},
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
      },
    },
    {
      toolName: 'run_command',
      toolArguments: JSON.stringify({
        command: 'bun test',
        timeout: 30000,
      }),
      expected: {target: 'bun test', targetKind: 'code'},
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
      },
    },
    {
      toolName: 'web_fetch_raw',
      toolArguments: JSON.stringify({url: 'https://example.com/raw'}),
      expected: {
        target: 'https://example.com/raw',
        targetKind: 'code',
      },
    },
    {
      toolName: 'load_skill',
      toolArguments: JSON.stringify({name: 'test-driven-development'}),
      expected: {
        target: 'test-driven-development',
        targetKind: 'text',
      },
    },
    {
      toolName: 'get_current_time',
      toolArguments: JSON.stringify({}),
      expected: {target: null, targetKind: 'text'},
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
    ).toEqual({target: 'run_command', targetKind: 'code'});
  });

  it('returns fallback pill content for adapter validation errors', () => {
    expect(
      getToolPillContent({
        toolName: 'read_file',
        toolArguments: JSON.stringify({startLine: 1}),
      }),
    ).toEqual({target: 'read_file', targetKind: 'code'});
  });

  it('returns fallback pill content for invalid get_current_time arguments', () => {
    expect(
      getToolPillContent({
        toolName: 'get_current_time',
        toolArguments: JSON.stringify([]),
      }),
    ).toEqual({target: 'get_current_time', targetKind: 'code'});
  });

  it('throws when ask_user reaches tool pill content', () => {
    expect(() =>
      getToolPillContent({
        toolName: 'ask_user',
        toolArguments: JSON.stringify({questions: []}),
      }),
    ).toThrow('ask_user is a client-side tool');
  });

  it('rethrows unrelated errors', () => {
    expect(() =>
      getToolPillContent({
        toolName: 'run_command',
        toolArguments: Symbol('arguments') as unknown as string,
      }),
    ).toThrow(TypeError);
  });
});
