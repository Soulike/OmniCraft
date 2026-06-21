import type {SseBaseEvent} from '@omnicraft/sse-events';
import {describe, expect, it, vi} from 'vitest';

import {EventBus} from '@/helpers/event-bus.js';
import type {ChatEventMap} from '@/modules/chat-events/index.js';

import {routeBaseEventToBus} from './route-base-event-to-bus.js';

function createBus() {
  return new EventBus<ChatEventMap>();
}

describe('routeBaseEventToBus', () => {
  it('routes text-delta to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('text-delta', handler);

    const event: SseBaseEvent = {type: 'text-delta', content: 'hello'};
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes tool-execute-start to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('tool-execute-start', handler);

    const event: SseBaseEvent = {
      type: 'tool-execute-start',
      callId: 'c1',
      toolName: 'read_file',
      displayName: 'Read File',
      arguments: '{}',
    };
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes done to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('done', handler);

    const event: SseBaseEvent = {
      type: 'done',
      reason: 'complete',
    };
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes usage-update to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('usage-update', handler);

    const event: SseBaseEvent = {
      type: 'usage-update',
      usage: {
        model: 'test-model',
        contextWindowTokens: 100,
        currentContextInputTokens: 10,
        sessionInputTokens: 10,
        sessionOutputTokens: 5,
        sessionCacheReadInputTokens: 0,
        thinkingLevel: 'none',
      },
    };
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes session-title to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('session-title', handler);

    const event: SseBaseEvent = {
      type: 'session-title',
      title: 'Multiplication',
    };
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes todo-update to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('todo-update', handler);

    const event: SseBaseEvent = {type: 'todo-update', items: []};
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes error to stream-error', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('stream-error', handler);

    routeBaseEventToBus({type: 'error', message: 'failed'}, bus);

    expect(handler).toHaveBeenCalledWith({message: 'failed'});
  });

  it('routes all thinking events', () => {
    const bus = createBus();
    const startHandler = vi.fn();
    const deltaHandler = vi.fn();
    const endHandler = vi.fn();
    bus.on('thinking-start', startHandler);
    bus.on('thinking-delta', deltaHandler);
    bus.on('thinking-end', endHandler);

    routeBaseEventToBus({type: 'thinking-start'}, bus);
    routeBaseEventToBus({type: 'thinking-delta', content: 'hmm'}, bus);
    routeBaseEventToBus({type: 'thinking-end'}, bus);

    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(deltaHandler).toHaveBeenCalledWith({
      type: 'thinking-delta',
      content: 'hmm',
    });
    expect(endHandler).toHaveBeenCalledTimes(1);
  });
});
