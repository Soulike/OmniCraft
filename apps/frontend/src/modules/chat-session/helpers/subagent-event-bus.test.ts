import {describe, expect, it, vi} from 'vitest';

import type {ChatEventMap} from '@/modules/chat-stream/index.js';

import {SubagentEventBus} from './subagent-event-bus.js';

function createBus() {
  return new SubagentEventBus();
}

function nextMicrotask() {
  return Promise.resolve();
}

describe('SubagentEventBus', () => {
  it('immediately delivers events to listeners already subscribed', () => {
    const bus = createBus();
    const listener = vi.fn<(data: ChatEventMap['user-message-sent']) => void>();
    const event: ChatEventMap['user-message-sent'] = {content: 'hello'};

    bus.on('user-message-sent', listener);
    bus.emit('user-message-sent', event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('replays matching historical events to a late listener on a microtask', async () => {
    const bus = createBus();
    const firstEvent: ChatEventMap['user-message-sent'] = {content: 'first'};
    const secondEvent: ChatEventMap['user-message-sent'] = {content: 'second'};
    const listener = vi.fn<(data: ChatEventMap['user-message-sent']) => void>();

    bus.emit('user-message-sent', firstEvent);
    bus.emit('user-message-sent', secondEvent);
    bus.on('user-message-sent', listener);

    expect(listener).not.toHaveBeenCalled();

    await nextMicrotask();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, firstEvent);
    expect(listener).toHaveBeenNthCalledWith(2, secondEvent);
  });

  it('does not replay historical events for a different event type', async () => {
    const bus = createBus();
    const listener = vi.fn<(data: ChatEventMap['user-message-sent']) => void>();

    bus.emit('stream-error', {message: 'failed'});
    bus.on('user-message-sent', listener);

    await nextMicrotask();

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not duplicate history for a listener that already received an event live', async () => {
    const bus = createBus();
    const listener = vi.fn<(data: ChatEventMap['user-message-sent']) => void>();
    const event: ChatEventMap['user-message-sent'] = {content: 'live'};

    bus.on('user-message-sent', listener);
    bus.emit('user-message-sent', event);
    bus.on('user-message-sent', listener);

    await nextMicrotask();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('off prevents a listener from receiving pending replayed history and future events', async () => {
    const bus = createBus();
    const listener = vi.fn<(data: ChatEventMap['user-message-sent']) => void>();

    bus.emit('user-message-sent', {content: 'before'});
    bus.on('user-message-sent', listener);
    bus.off('user-message-sent', listener);

    await nextMicrotask();
    bus.emit('user-message-sent', {content: 'after'});

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not call the same listener twice when registered twice for the same event', async () => {
    const bus = createBus();
    const listener = vi.fn<(data: ChatEventMap['user-message-sent']) => void>();
    const event: ChatEventMap['user-message-sent'] = {content: 'only once'};

    bus.on('user-message-sent', listener);
    bus.on('user-message-sent', listener);
    await nextMicrotask();
    bus.emit('user-message-sent', event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });
});
