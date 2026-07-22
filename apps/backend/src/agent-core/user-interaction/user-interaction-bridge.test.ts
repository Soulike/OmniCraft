import {describe, expect, it} from 'vitest';

import {UserInteractionBridge} from './user-interaction-bridge.js';

describe('UserInteractionBridge.hasPending', () => {
  it('is false when nothing is pending', () => {
    const bridge = new UserInteractionBridge();
    expect(bridge.hasPending).toBe(false);
  });

  it('is true while an interaction is awaiting a response', () => {
    const bridge = new UserInteractionBridge();
    void bridge.waitForResponse('c1');
    expect(bridge.hasPending).toBe(true);
  });

  it('is false again after the response is submitted', async () => {
    const bridge = new UserInteractionBridge();
    const pending = bridge.waitForResponse('c1');
    bridge.submitResponse('c1', {ok: true});
    await pending;
    expect(bridge.hasPending).toBe(false);
  });

  it('is false again after the waiting signal aborts', async () => {
    const bridge = new UserInteractionBridge();
    const controller = new AbortController();
    const pending = bridge.waitForResponse('c1', controller.signal);
    expect(bridge.hasPending).toBe(true);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(bridge.hasPending).toBe(false);
  });

  it('rejects and stores nothing when the signal is already aborted', async () => {
    const bridge = new UserInteractionBridge();
    const controller = new AbortController();
    controller.abort();
    await expect(
      bridge.waitForResponse('c1', controller.signal),
    ).rejects.toThrow();
    expect(bridge.hasPending).toBe(false);
  });
});
