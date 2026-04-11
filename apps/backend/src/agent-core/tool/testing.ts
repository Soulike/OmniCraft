/**
 * Shared test helpers for the tool module.
 * Only imported by test files — never by production code.
 */
import os from 'node:os';

import {z} from 'zod';

import {FileContentCache} from '../agent/file-content-cache.js';
import {FileStatTracker} from '../agent/file-stat-tracker.js';
import type {ToolDefinition, ToolExecutionContext} from './types.js';

const mockResultSchema = z.object({mock: z.literal(true)});

/** Creates a minimal mock ToolDefinition. */
export function createMockTool(name: string): ToolDefinition {
  return {
    name,
    displayName: `Mock: ${name}`,
    description: `Mock tool: ${name}`,
    parameters: z.object({}),
    resultSchema: mockResultSchema,
    execute: () =>
      Promise.resolve({
        data: {mock: true},
        content: 'ok',
        status: 'success' as const,
      }),
  };
}

/** Creates a ToolExecutionContext with sensible defaults, overridable per field. */
export function createMockContext(
  overrides?: Partial<ToolExecutionContext>,
): ToolExecutionContext {
  const workingDirectory = overrides?.workingDirectory ?? os.tmpdir();
  return {
    availableSkills: new Map(),
    workingDirectory,
    fileCache: new FileContentCache(),
    fileStatTracker: new FileStatTracker(),
    extraAllowedPaths: [],
    shellState: {cwd: workingDirectory},
    signal: new AbortController().signal,
    ...overrides,
  };
}
