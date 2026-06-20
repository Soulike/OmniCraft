import type {SseTodoItem} from '@omnicraft/sse-events';
import {describe, expect, it} from 'vitest';

import type {ChatEventBus, ChatMessage} from '../types.js';
import {
  applyTodoUpdate,
  pushCompactionEvent,
  updateSubagentStatus,
} from './useMessages.js';

const startEvent = {
  type: 'context-compaction-start' as const,
  compactionId: 'cid-1',
  reason: 'after-turn' as const,
  beforeTokens: 1000,
  messageCount: 5,
};
const endEvent = {
  type: 'context-compaction-end' as const,
  compactionId: 'cid-1',
  summary: 'a summary',
  beforeTokens: 1000,
  afterTokens: 200,
  messageCount: 5,
  durationMs: 50,
};
const errorEvent = {
  type: 'context-compaction-error' as const,
  compactionId: 'cid-1',
  reason: 'after-turn' as const,
  message: 'Aborted',
  beforeTokens: 1000,
  messageCount: 5,
};

describe('pushCompactionEvent', () => {
  it('appends a start event as the only new message', () => {
    const result = pushCompactionEvent([], startEvent);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(startEvent);
  });

  it('appends an end event as the only new message', () => {
    const result = pushCompactionEvent([], endEvent);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(endEvent);
  });

  it('appends an error event as the only new message', () => {
    const result = pushCompactionEvent([], errorEvent);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(errorEvent);
  });

  it('strips a trailing empty assistant placeholder before appending', () => {
    const result = pushCompactionEvent(
      [
        {
          id: null,
          createdAt: null,
          role: 'assistant',
          content: {type: 'text', content: ''},
        },
      ],
      startEvent,
    );
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(startEvent);
  });
});

describe('updateSubagentStatus', () => {
  it('updates only the latest running subagent item with the matching agent id', () => {
    const eventBus = {} as ChatEventBus;
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'subagent',
          mode: 'dispatch',
          agentId: 'agent-1',
          task: 'Initial task',
          agentType: 'general',
          thinkingLevel: 'none',
          workingDirectory: '/tmp',
          status: 'complete',
          eventBus,
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'subagent',
          mode: 'resume',
          agentId: 'agent-1',
          task: 'Follow-up task',
          agentType: 'general',
          thinkingLevel: 'none',
          workingDirectory: '/tmp',
          status: 'running',
          eventBus,
        },
      },
    ];

    const result = updateSubagentStatus(messages, {
      agentId: 'agent-1',
      status: 'failure',
    });

    expect(result[0].content).toMatchObject({
      type: 'subagent',
      mode: 'dispatch',
      status: 'complete',
    });
    expect(result[1].content).toMatchObject({
      type: 'subagent',
      mode: 'resume',
      status: 'error',
    });
  });
});

const todoItems = (statuses: SseTodoItem['status'][]): SseTodoItem[] =>
  statuses.map((status, index) => ({
    index,
    subject: `Task ${index}`,
    description: `Desc ${index}`,
    status,
  }));

describe('applyTodoUpdate', () => {
  it('appends a new todo card when the list is empty', () => {
    const items = todoItems(['in_progress', 'pending']);
    const result = applyTodoUpdate([], items);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items});
  });

  it('replaces in place when the last message is a todo card', () => {
    const first = todoItems(['in_progress', 'pending']);
    const afterFirst = applyTodoUpdate([], first);
    const second = todoItems(['completed', 'in_progress']);
    const result = applyTodoUpdate(afterFirst, second);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items: second});
  });

  it('appends a new todo card when a non-todo message is last', () => {
    const prev = applyTodoUpdate([], todoItems(['completed']));
    const withWork: typeof prev = [
      ...prev,
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'Did some work'},
      },
    ];
    const next = todoItems(['completed', 'in_progress']);
    const result = applyTodoUpdate(withWork, next);
    expect(result).toHaveLength(3);
    expect(result[2].content).toEqual({type: 'todo', items: next});
  });

  it('strips a trailing empty assistant placeholder before appending', () => {
    const withPlaceholder = [
      {
        id: null,
        createdAt: null,
        role: 'assistant' as const,
        content: {type: 'text' as const, content: ''},
      },
    ];
    const items = todoItems(['pending']);
    const result = applyTodoUpdate(withPlaceholder, items);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items});
  });

  it('replaces in place across an empty placeholder from a silent round', () => {
    // A tool-only round can append an empty assistant placeholder between the
    // existing todo card and the next todo-update. The card must be replaced,
    // not duplicated.
    const first = todoItems(['in_progress', 'pending']);
    const state = [
      ...applyTodoUpdate([], first),
      {
        id: 'msg-1',
        createdAt: 123,
        role: 'assistant' as const,
        content: {type: 'text' as const, content: ''},
      },
    ];
    const second = todoItems(['completed', 'in_progress']);
    const result = applyTodoUpdate(state, second);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items: second});
  });

  it('ignores a redundant update separated by a visible tool', () => {
    // Parallel tool round: the suppressed todo tool and a visible tool both
    // emit todo-update for the same version, separated by the visible tool's
    // tool-execute-end. The identical second snapshot must NOT add a duplicate.
    const snapshot = todoItems(['completed', 'in_progress']);
    const state = [
      ...applyTodoUpdate([], snapshot),
      {
        id: null,
        createdAt: null,
        role: 'assistant' as const,
        content: {
          type: 'tool-execute-end' as const,
          callId: 'call-1',
          result: 'ok',
          status: 'failure' as const,
          data: {message: 'ok'},
        },
      },
    ];
    const result = applyTodoUpdate(
      state,
      todoItems(['completed', 'in_progress']),
    );
    expect(result).toBe(state);
    expect(result.filter((m) => m.content.type === 'todo')).toHaveLength(1);
  });

  it('appends a new card when the plan changes after a visible tool', () => {
    // A genuinely different snapshot after intervening work still starts a
    // fresh card (the redundant-update guard only short-circuits exact repeats).
    const first = todoItems(['in_progress', 'pending']);
    const state = [
      ...applyTodoUpdate([], first),
      {
        id: null,
        createdAt: null,
        role: 'assistant' as const,
        content: {
          type: 'tool-execute-end' as const,
          callId: 'call-1',
          result: 'ok',
          status: 'failure' as const,
          data: {message: 'ok'},
        },
      },
    ];
    const second = todoItems(['completed', 'in_progress']);
    const result = applyTodoUpdate(state, second);
    expect(result.filter((m) => m.content.type === 'todo')).toHaveLength(2);
    expect(result[result.length - 1].content).toEqual({
      type: 'todo',
      items: second,
    });
  });

  it('clears the existing card in place on an empty snapshot (todoClear)', () => {
    const state = applyTodoUpdate([], todoItems(['in_progress', 'pending']));
    const result = applyTodoUpdate(state, []);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items: []});
  });

  it('keeps a trailing placeholder on an empty snapshot with no card', () => {
    // todoClear before any todoWrite: must not strip the working-indicator
    // placeholder to append an invisible empty card.
    const placeholder = {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    };
    const result = applyTodoUpdate([placeholder], []);
    expect(result).toEqual([placeholder]);
    expect(result.some((m) => m.content.type === 'todo')).toBe(false);
  });

  it('does not clear a prior turn card on a new-turn empty snapshot', () => {
    // A todoClear in a new turn must not reach across the user message and
    // empty the previous turn's card, which would retroactively drop rendered
    // history.
    const prior = todoItems(['completed', 'completed']);
    const state = [
      ...applyTodoUpdate([], prior),
      {
        id: 'u1',
        createdAt: 1,
        role: 'user' as const,
        content: {type: 'text' as const, content: 'next'},
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant' as const,
        content: {type: 'text' as const, content: ''},
      },
    ];
    const result = applyTodoUpdate(state, []);
    expect(result).toBe(state);
    expect(result[0].content).toEqual({type: 'todo', items: prior});
  });

  it('starts a fresh card in a new turn even if items match a prior turn', () => {
    // The redundant-update guard must not reach across the user message into the
    // previous turn — re-emitting the same plan after "continue" should still
    // produce a Plan card in the new assistant response.
    const items = todoItems(['in_progress', 'pending']);
    const state = [
      ...applyTodoUpdate([], items),
      {
        id: 'u1',
        createdAt: 1,
        role: 'user' as const,
        content: {type: 'text' as const, content: 'continue'},
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant' as const,
        content: {type: 'text' as const, content: ''},
      },
    ];
    const result = applyTodoUpdate(
      state,
      todoItems(['in_progress', 'pending']),
    );
    expect(result.filter((m) => m.content.type === 'todo')).toHaveLength(2);
    expect(result[result.length - 1].content).toEqual({type: 'todo', items});
  });
});
