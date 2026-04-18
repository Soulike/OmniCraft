/**
 * Shared test helpers for the tool module.
 * Only imported by test files — never by production code.
 */
import os from 'node:os';

import {z} from 'zod';

import {FileContentCache} from '../agent/file-content-cache.js';
import {FileStatTracker} from '../agent/file-stat-tracker.js';
import {TodoStore} from '../agent/todo-store.js';
import {UserInteractionBridge} from '../user-interaction/index.js';
import type {ToolDefinition, ToolExecutionContext} from './types.js';

/** Creates a minimal mock ToolDefinition. */
export function createMockTool(name: string): ToolDefinition {
  return {
    name,
    displayName: `Mock: ${name}`,
    description: `Mock tool: ${name}`,
    parameters: z.object({}),
    suppressToolEvents: false,
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
    callId: 'mock-call-id',
    availableSkills: new Map(),
    workingDirectory,
    fileCache: new FileContentCache(),
    fileStatTracker: new FileStatTracker(),
    extraAllowedPaths: [],
    shellState: {cwd: workingDirectory},
    signal: new AbortController().signal,
    onSubAgentEvent: () => {
      // noop — mock context ignores subagent events
    },
    userInteractionBridge: new UserInteractionBridge(),
    todoStore: new TodoStore(),
    ...overrides,
  };
}
