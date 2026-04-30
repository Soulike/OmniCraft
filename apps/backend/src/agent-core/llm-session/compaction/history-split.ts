import type {LlmMessage} from '../../llm-api/index.js';

export interface HistorySplitOptions {
  readonly minRawMessages: number;
}

export interface HistorySplitResult {
  readonly compactablePrefix: LlmMessage[];
  readonly rawSuffix: LlmMessage[];
}

export function splitCompactablePrefix(
  messages: readonly LlmMessage[],
  options: HistorySplitOptions,
): HistorySplitResult {
  let rawStart = Math.max(0, messages.length - options.minRawMessages);
  const returnedCallIds = new Set<string>();
  let keptMostRecentToolGroup = false;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (message.role === 'tool') {
      returnedCallIds.add(message.callId);
      continue;
    }

    if (message.role !== 'assistant' || message.toolCalls.length === 0) {
      continue;
    }

    const hasUnclosedToolCall = message.toolCalls.some(
      (toolCall) => !returnedCallIds.has(toolCall.callId),
    );

    if (hasUnclosedToolCall || !keptMostRecentToolGroup) {
      rawStart = Math.min(rawStart, index);
      keptMostRecentToolGroup = true;
    }
  }

  return {
    compactablePrefix: messages.slice(0, rawStart),
    rawSuffix: messages.slice(rawStart),
  };
}
