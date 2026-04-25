import type {
  SseBaseEvent,
  SseEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseToolExecuteDeltaEvent,
} from '@omnicraft/sse-events';
import {describe, expect, it} from 'vitest';

import {sseReplayCompressor} from './sse-replay-compressor.js';

function textDelta(content: string): SseTextDeltaEvent {
  return {type: 'text-delta', content};
}

function thinkingDelta(content: string): SseThinkingDeltaEvent {
  return {type: 'thinking-delta', content};
}

function toolExecuteDelta(
  callId: string,
  content: string,
): SseToolExecuteDeltaEvent {
  return {type: 'tool-execute-delta', callId, content};
}

function messageStart(messageId = 'msg-1'): SseMessageStartEvent {
  return {
    type: 'message-start',
    role: 'assistant',
    messageId,
    createdAt: 0,
    content: '',
  };
}

function subagentOutput(agentId: string, event: SseBaseEvent): SseEvent {
  return {type: 'subagent-output', agentId, event};
}

function expectMerge(
  current: SseEvent,
  next: SseEvent,
  expected: SseEvent,
): void {
  expect(sseReplayCompressor.canMerge(current, next)).toBe(true);
  expect(sseReplayCompressor.merge(current, next)).toEqual(expected);
}

describe('sseReplayCompressor', () => {
  it('merges consecutive top-level text deltas', () => {
    expectMerge(textDelta('a'), textDelta('b'), textDelta('ab'));
  });

  it('merges consecutive top-level thinking deltas', () => {
    expectMerge(thinkingDelta('x'), thinkingDelta('y'), thinkingDelta('xy'));
  });

  it('merges consecutive top-level tool deltas for the same callId', () => {
    expectMerge(
      toolExecuteDelta('call-1', 'a'),
      toolExecuteDelta('call-1', 'b'),
      toolExecuteDelta('call-1', 'ab'),
    );
  });

  it('does not merge top-level tool deltas for different callIds', () => {
    expect(
      sseReplayCompressor.canMerge(
        toolExecuteDelta('call-1', 'a'),
        toolExecuteDelta('call-2', 'b'),
      ),
    ).toBe(false);
  });

  it('does not merge top-level events across delta types or boundaries', () => {
    expect(
      sseReplayCompressor.canMerge(textDelta('a'), thinkingDelta('b')),
    ).toBe(false);
    expect(sseReplayCompressor.canMerge(textDelta('a'), messageStart())).toBe(
      false,
    );
  });

  it('merges nested subagent text deltas for the same agent', () => {
    expectMerge(
      subagentOutput('subagent-1', textDelta('a')),
      subagentOutput('subagent-1', textDelta('b')),
      subagentOutput('subagent-1', textDelta('ab')),
    );
  });

  it('merges nested subagent thinking deltas for the same agent', () => {
    expectMerge(
      subagentOutput('subagent-1', thinkingDelta('x')),
      subagentOutput('subagent-1', thinkingDelta('y')),
      subagentOutput('subagent-1', thinkingDelta('xy')),
    );
  });

  it('merges nested subagent tool deltas for the same agent and callId', () => {
    expectMerge(
      subagentOutput('subagent-1', toolExecuteDelta('call-1', 'a')),
      subagentOutput('subagent-1', toolExecuteDelta('call-1', 'b')),
      subagentOutput('subagent-1', toolExecuteDelta('call-1', 'ab')),
    );
  });

  it('does not merge nested subagent deltas across different agents', () => {
    expect(
      sseReplayCompressor.canMerge(
        subagentOutput('subagent-1', textDelta('a')),
        subagentOutput('subagent-2', textDelta('b')),
      ),
    ).toBe(false);
  });

  it('does not merge nested subagent tool deltas across different callIds', () => {
    expect(
      sseReplayCompressor.canMerge(
        subagentOutput('subagent-1', toolExecuteDelta('call-1', 'a')),
        subagentOutput('subagent-1', toolExecuteDelta('call-2', 'b')),
      ),
    ).toBe(false);
  });

  it('does not merge nested subagent events across inner delta types or boundaries', () => {
    expect(
      sseReplayCompressor.canMerge(
        subagentOutput('subagent-1', textDelta('a')),
        subagentOutput('subagent-1', thinkingDelta('b')),
      ),
    ).toBe(false);
    expect(
      sseReplayCompressor.canMerge(
        subagentOutput('subagent-1', textDelta('a')),
        subagentOutput('subagent-1', messageStart()),
      ),
    ).toBe(false);
  });

  it('does not merge top-level deltas with nested subagent deltas', () => {
    expect(
      sseReplayCompressor.canMerge(
        textDelta('a'),
        subagentOutput('subagent-1', textDelta('b')),
      ),
    ).toBe(false);
  });
});
