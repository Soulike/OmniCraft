import os from 'node:os';

import type {SseSubAgentEvent, SseTodoItem} from '@omnicraft/sse-events';
import {describe, expect, it} from 'vitest';

import type {LlmConfig} from '../llm-api/index.js';
import {AgentRuntimeState} from './agent-runtime-state.js';
import {SubagentRegistry} from './state/subagent-registry.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
  thinkingLevel: 'none',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};

const LIGHT_CONFIG: LlmConfig = {
  ...MAIN_CONFIG,
  model: 'light-model',
};

describe('AgentRuntimeState', () => {
  it('keeps shell and todo state isolated per agent instance', () => {
    const first = new AgentRuntimeState('/workspace/one');
    const second = new AgentRuntimeState('/workspace/two');
    const firstSubagentRegistry = new SubagentRegistry();
    const secondSubagentRegistry = new SubagentRegistry();

    const firstContext = first.buildToolExecutionContext({
      callId: 'call-1',
      agentId: 'agent-1',
      sessionsDir: null,
      subagentRegistry: firstSubagentRegistry,
      availableSkills: new Map(),
      workingDirectory: '/workspace/one',
      scratchDirectory: '/scratch',
      signal: new AbortController().signal,
      onSubAgentEvent: () => undefined,
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getTierConfig: () => Promise.resolve(LIGHT_CONFIG),
    });
    const secondContext = second.buildToolExecutionContext({
      callId: 'call-2',
      agentId: 'agent-2',
      sessionsDir: null,
      subagentRegistry: secondSubagentRegistry,
      availableSkills: new Map(),
      workingDirectory: '/workspace/two',
      scratchDirectory: '/scratch',
      signal: new AbortController().signal,
      onSubAgentEvent: () => undefined,
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getTierConfig: () => Promise.resolve(LIGHT_CONFIG),
    });

    firstContext.shellState.cwd = '/workspace/one/subdir';
    firstContext.todoStore.append([
      {subject: 'first task', description: 'belongs to first agent'},
    ]);

    expect(firstContext.shellState.cwd).toBe('/workspace/one/subdir');
    expect(secondContext.shellState.cwd).toBe('/workspace/two');
    expect(first.todoVersion).toBe(1);
    expect(second.todoVersion).toBe(0);
    expect(first.listTodos()).toEqual([
      {
        index: 0,
        subject: 'first task',
        description: 'belongs to first agent',
        status: 'pending',
      },
    ]);
    expect(second.listTodos()).toEqual([]);
  });

  it('builds a tool context with the supplied per-call fields', () => {
    const state = new AgentRuntimeState('/workspace/project');
    const signal = new AbortController().signal;
    const subAgentEvents: SseSubAgentEvent[] = [];
    const subagentRegistry = new SubagentRegistry();

    const context = state.buildToolExecutionContext({
      callId: 'call-123',
      agentId: 'agent-123',
      sessionsDir: '/sessions',
      subagentRegistry,
      availableSkills: new Map(),
      workingDirectory: '/workspace/project',
      scratchDirectory: '/scratch',
      signal,
      onSubAgentEvent: (event) => {
        subAgentEvents.push(event);
      },
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getTierConfig: () => Promise.resolve(LIGHT_CONFIG),
    });

    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: 'child-agent',
      status: 'success',
    });

    expect(context.callId).toBe('call-123');
    expect(context.agentId).toBe('agent-123');
    expect(context.sessionsDir).toBe('/sessions');
    expect(context.subagentRegistry).toBe(subagentRegistry);
    expect(context.workingDirectory).toBe('/workspace/project');
    expect(context.signal).toBe(signal);
    expect(subAgentEvents).toEqual([
      {type: 'subagent-complete', agentId: 'child-agent', status: 'success'},
    ]);
  });

  it('submits responses through the per-agent interaction bridge', async () => {
    const state = new AgentRuntimeState('/workspace/project');
    const context = state.buildToolExecutionContext({
      callId: 'call-1',
      agentId: 'agent-1',
      sessionsDir: null,
      subagentRegistry: new SubagentRegistry(),
      availableSkills: new Map(),
      workingDirectory: '/workspace/project',
      scratchDirectory: '/scratch',
      signal: new AbortController().signal,
      onSubAgentEvent: () => undefined,
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getTierConfig: () => Promise.resolve(LIGHT_CONFIG),
    });

    const responsePromise =
      context.userInteractionBridge.waitForResponse('interaction-1');

    expect(state.submitUserResponse('missing', {ok: false})).toBe(false);
    expect(state.submitUserResponse('interaction-1', {ok: true})).toBe(true);
    await expect(responsePromise).resolves.toEqual({ok: true});
  });

  it('restores todos and version from an initial snapshot', () => {
    const todos: SseTodoItem[] = [
      {
        index: 0,
        subject: 'Restored task',
        description: 'From snapshot',
        status: 'in_progress',
      },
    ];
    const state = new AgentRuntimeState('/workspace/project', todos);

    expect(state.listTodos()).toEqual(todos);
    expect(state.todoVersion).toBe(1);
  });

  it('defaults to an empty todo list when no snapshot is provided', () => {
    const state = new AgentRuntimeState('/workspace/project');

    expect(state.listTodos()).toEqual([]);
    expect(state.todoVersion).toBe(0);
  });
});

describe('AgentRuntimeState.isWaitingForInput', () => {
  it('reflects a pending client-tool interaction on its own bridge', async () => {
    const state = new AgentRuntimeState(os.tmpdir());
    const context = state.buildToolExecutionContext({
      callId: 'c1',
      agentId: 'a1',
      sessionsDir: null,
      subagentRegistry: new SubagentRegistry(),
      availableSkills: new Map(),
      workingDirectory: os.tmpdir(),
      signal: new AbortController().signal,
      onSubAgentEvent: () => {
        // noop — the delegation test ignores subagent events
      },
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getTierConfig: () => Promise.resolve(MAIN_CONFIG),
    });

    expect(state.isWaitingForInput).toBe(false);
    const pending = context.userInteractionBridge.waitForResponse('c1');
    expect(state.isWaitingForInput).toBe(true);
    state.submitUserResponse('c1', {ok: true});
    await pending;
    expect(state.isWaitingForInput).toBe(false);
  });
});
