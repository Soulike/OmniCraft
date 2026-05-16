import type {
  SseContextCompactionEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
} from '@omnicraft/sse-events';

import type {LlmToolCall} from '../llm-api/index.js';
import type {LlmSessionEventStream} from '../llm-session/index.js';

export type AgentLlmStreamTranslatorEvent =
  | SseTextDeltaEvent
  | SseThinkingStartEvent
  | SseThinkingDeltaEvent
  | SseThinkingEndEvent
  | SseMessageStartEvent
  | SseContextCompactionEvent;

export class AgentLlmStreamTranslator {
  async *consume(
    stream: LlmSessionEventStream,
  ): AsyncGenerator<AgentLlmStreamTranslatorEvent, LlmToolCall[], undefined> {
    const toolCalls: LlmToolCall[] = [];
    for await (const event of stream) {
      switch (event.type) {
        case 'text-delta':
        case 'thinking-start':
        case 'thinking-delta':
        case 'thinking-end':
          yield event;
          break;
        case 'message-start':
          yield {
            type: 'message-start',
            role: 'assistant',
            messageId: event.messageId,
            createdAt: event.createdAt,
            content: '',
          } satisfies SseMessageStartEvent;
          break;
        case 'tool-call':
          toolCalls.push(event.toolCall);
          break;
        case 'compaction-sse':
          yield event.event;
          break;
      }
    }
    return toolCalls;
  }
}

export const agentLlmStreamTranslator = new AgentLlmStreamTranslator();
