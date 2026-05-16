import {describe, expect, it} from 'vitest';

import type {LlmToolCall} from '../llm-api/index.js';
import type {LlmSessionEventStream} from '../llm-session/index.js';
import {
  agentStreamConsumer,
  type AgentStreamConsumerEvent,
} from './agent-stream-consumer.js';

async function collectWithReturn<TReturn>(
  stream: AsyncGenerator<AgentStreamConsumerEvent, TReturn, undefined>,
): Promise<{events: AgentStreamConsumerEvent[]; result: TReturn}> {
  const events: AgentStreamConsumerEvent[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      return {events, result: next.value};
    }
    events.push(next.value);
  }
}

describe('AgentStreamConsumer', () => {
  it('yields SSE events and returns collected tool calls', async () => {
    const toolCall: LlmToolCall = {
      callId: 'call-1',
      toolName: 'mock_tool',
      arguments: '{"ok":true}',
    };

    async function* llmStream(): LlmSessionEventStream {
      yield {
        type: 'message-start',
        messageId: 'assistant-message',
        createdAt: 1,
      };
      await Promise.resolve();
      yield {type: 'text-delta', content: 'hello'};
      yield {type: 'thinking-start'};
      yield {type: 'thinking-delta', content: 'thought'};
      yield {type: 'thinking-end'};
      yield {type: 'tool-call', toolCall};
      yield {
        type: 'compaction-sse',
        event: {
          type: 'context-compaction-start',
          compactionId: 'compaction-1',
          reason: 'after-turn',
          beforeTokens: 100,
          messageCount: 3,
        },
      };
    }

    const {events, result} = await collectWithReturn(
      agentStreamConsumer.consume(llmStream()),
    );

    expect(events).toEqual([
      {
        type: 'message-start',
        role: 'assistant',
        messageId: 'assistant-message',
        createdAt: 1,
        content: '',
      },
      {type: 'text-delta', content: 'hello'},
      {type: 'thinking-start'},
      {type: 'thinking-delta', content: 'thought'},
      {type: 'thinking-end'},
      {
        type: 'context-compaction-start',
        compactionId: 'compaction-1',
        reason: 'after-turn',
        beforeTokens: 100,
        messageCount: 3,
      },
    ]);
    expect(result).toEqual([toolCall]);
  });
});
