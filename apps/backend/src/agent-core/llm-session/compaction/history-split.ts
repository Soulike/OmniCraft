import type {LlmMessage} from '../../llm-api/index.js';

export interface HistorySplitOptions {
  readonly minRawMessages: number;
}

export interface HistorySplitResult {
  readonly compactablePrefix: LlmMessage[];
  readonly rawSuffix: LlmMessage[];
}

/**
 * Splits history into an old prefix that can be summarized and a raw suffix
 * that must remain verbatim.
 *
 * The raw suffix keeps at least `minRawMessages` recent messages. It may keep
 * more when needed to avoid separating assistant tool calls from their tool
 * results, and it also preserves the most recent closed tool-call group for
 * continuity.
 */
export function splitCompactablePrefix(
  messages: readonly LlmMessage[],
  options: HistorySplitOptions,
): HistorySplitResult {
  // Start with the simple recency boundary: keep at least the last N messages.
  let rawStart = Math.max(0, messages.length - options.minRawMessages);

  // While scanning backward, tool results seen so far belong to assistant tool
  // calls later in the conversation and therefore mark those calls as closed.
  const returnedCallIds = new Set<string>();
  let keptMostRecentClosedToolGroup = false;

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

    if (hasUnclosedToolCall) {
      // Keep the assistant message and everything after it so the provider does
      // not see a tool call without its matching tool result in raw history.
      rawStart = Math.min(rawStart, index);
      continue;
    }

    if (!keptMostRecentClosedToolGroup) {
      // Preserve only the most recent closed tool group verbatim; older closed
      // groups can be summarized to keep the raw suffix bounded.
      rawStart = Math.min(rawStart, index);
      keptMostRecentClosedToolGroup = true;
    }
  }

  return {
    compactablePrefix: messages.slice(0, rawStart),
    rawSuffix: messages.slice(rawStart),
  };
}
