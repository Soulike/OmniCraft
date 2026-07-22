/**
 * Shared test helpers for the tool module.
 * Only imported by test files — never by production code.
 */
import os from 'node:os';

import {z} from 'zod';

import {FileContentCache} from '../agent/state/file-content-cache.js';
import {FileStatTracker} from '../agent/state/file-stat-tracker.js';
import {SubagentRegistry} from '../agent/state/subagent-registry.js';
import {TodoStore} from '../agent/state/todo-store.js';
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
  const scratchDirectory = overrides?.scratchDirectory ?? os.tmpdir();
  return {
    callId: 'mock-call-id',
    agentId: 'mock-agent-id',
    sessionsDir: null,
    subagentRegistry: new SubagentRegistry(),
    availableSkills: new Map(),
    workingDirectory,
    scratchDirectory,
    fileCache: new FileContentCache(),
    fileStatTracker: new FileStatTracker(),
    shellState: {cwd: workingDirectory},
    signal: new AbortController().signal,
    onSubAgentEvent: () => {
      // noop — mock context ignores subagent events
    },
    userInteractionBridge: new UserInteractionBridge(),
    todoStore: new TodoStore(),
    todoState: {lastObservedVersion: undefined},
    getConfig: () =>
      Promise.resolve({
        apiFormat: 'claude' as const,
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'mock-model',
        thinkingLevel: 'none' as const,
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      }),
    getTierConfig: () =>
      Promise.resolve({
        apiFormat: 'claude' as const,
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'mock-light-model',
        thinkingLevel: 'none' as const,
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      }),
    ...overrides,
  };
}
