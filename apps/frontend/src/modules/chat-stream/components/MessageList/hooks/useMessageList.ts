import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseCompactionReason,
  SseContextCompactionEndEvent,
  SseContextCompactionErrorEvent,
  SseTodoItem,
} from '@omnicraft/sse-events';
import type {
  AnyToolResultData,
  InternalToolName,
  McpToolName,
  mcpToolResultSchema,
  ToolFailureData,
  ToolName,
  ToolResultData,
} from '@omnicraft/tool-schemas';
import {useMemo} from 'react';
import type {z} from 'zod';

import type {
  ChatEventBus,
  ChatMessage,
  SubagentMode,
} from '@/modules/chat-events/index.js';

export interface UserTextRenderItem {
  type: 'user-text';
  id: string | null;
  content: string;
  createdAt: number | null;
}

export interface AssistantTextRenderItem {
  type: 'assistant-text';
  id: string | null;
  content: string;
  createdAt: number | null;
}

interface RunningToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'running';
}

interface FailedToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'failure' | 'error';
  result: string;
  data: ToolFailureData;
}

/**
 * A completed built-in tool execution: `toolName` and `data` are correlated
 * per built-in tool, restoring the name -> result-data mapping that a bare
 * `string` toolName lost.
 */
type DoneInternalToolExecutionRenderItem = {
  [K in InternalToolName]: {
    type: 'tool-execution';
    callId: string;
    toolName: K;
    displayName: string;
    arguments: string;
    status: 'done';
    result: string;
    data: ToolResultData<K>;
  };
}[InternalToolName];

/** A completed MCP tool execution: the generic `{server, toolName, text}` shape. */
interface DoneMcpToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: McpToolName;
  displayName: string;
  arguments: string;
  status: 'done';
  result: string;
  data: z.infer<typeof mcpToolResultSchema>;
}

type DoneToolExecutionRenderItem =
  | DoneInternalToolExecutionRenderItem
  | DoneMcpToolExecutionRenderItem;

export type ToolExecutionRenderItem =
  | RunningToolExecutionRenderItem
  | FailedToolExecutionRenderItem
  | DoneToolExecutionRenderItem;

export interface ThinkingRenderItem {
  type: 'thinking';
  content: string;
  done: boolean;
}

export interface SubagentRenderItem {
  type: 'subagent';
  mode: SubagentMode;
  agentId: string;
  nickname?: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export interface TodoRenderItem {
  type: 'todo';
  items: readonly SseTodoItem[];
}

export type ContextCompactionRenderItem =
  | {
      type: 'context-compaction';
      status: 'in-progress';
      compactionId: string;
      reason: SseCompactionReason;
      beforeTokens: number;
      messageCount: number;
    }
  | {
      type: 'context-compaction';
      status: 'done';
      compactionId: string;
      reason: SseCompactionReason;
      beforeTokens: number;
      messageCount: number;
      summary: string;
      afterTokens: number;
      durationMs: number;
    }
  | {
      type: 'context-compaction';
      status: 'failed';
      compactionId: string;
      reason: SseCompactionReason;
      beforeTokens: number;
      messageCount: number;
      errorMessage: string;
    };

export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem
  | ThinkingRenderItem
  | SubagentRenderItem
  | TodoRenderItem
  | ContextCompactionRenderItem;

/** Converts a ChatMessage[] into renderable MessageRenderItem[]. */
export function transformMessages(
  messages: ChatMessage[],
): MessageRenderItem[] {
  // First pass: collect tool-execute-end events by callId
  const endEvents = new Map<
    string,
    {
      result: string;
      status: 'success' | 'failure' | 'error';
      data: AnyToolResultData;
    }
  >();
  // Collect compaction terminal events by compactionId
  const compactionEnds = new Map<string, SseContextCompactionEndEvent>();
  const compactionErrors = new Map<string, SseContextCompactionErrorEvent>();
  for (const message of messages) {
    if (message.content.type === 'tool-execute-end') {
      endEvents.set(message.content.callId, {
        result: message.content.result,
        status: message.content.status,
        data: message.content.data,
      });
    } else if (message.content.type === 'context-compaction-end') {
      compactionEnds.set(message.content.compactionId, message.content);
    } else if (message.content.type === 'context-compaction-error') {
      compactionErrors.set(message.content.compactionId, message.content);
    }
  }

  // Second pass: build render items
  const items: MessageRenderItem[] = [];
  for (const message of messages) {
    const {content} = message;

    switch (content.type) {
      case 'text': {
        if (message.role === 'user') {
          items.push({
            type: 'user-text',
            id: message.id,
            content: content.content,
            createdAt: message.createdAt,
          });
        } else {
          items.push({
            type: 'assistant-text',
            id: message.id,
            content: content.content,
            createdAt: message.createdAt,
          });
        }
        break;
      }
      case 'tool-execute-start': {
        const endEvent = endEvents.get(content.callId);
        if (endEvent) {
          items.push({
            type: 'tool-execution',
            callId: content.callId,
            toolName: content.toolName,
            displayName: content.displayName,
            arguments: content.arguments,
            status:
              endEvent.status === 'success'
                ? 'done'
                : endEvent.status === 'failure'
                  ? 'failure'
                  : 'error',
            result: endEvent.result,
            data: endEvent.data,
            // Cast required: `status` and `data` are read from separate SSE
            // events, so TypeScript cannot verify that a 'failure'/'error'
            // status pairs with ToolFailureData (as opposed to the broader
            // AnyToolResultData typing of endEvent.data).
          } as ToolExecutionRenderItem);
        } else {
          items.push({
            type: 'tool-execution',
            callId: content.callId,
            toolName: content.toolName,
            displayName: content.displayName,
            arguments: content.arguments,
            status: 'running',
          });
        }
        break;
      }
      case 'tool-execute-end':
        // Already handled via the start event pairing above
        break;
      case 'thinking': {
        if (content.done && content.content.trim() === '') break;
        items.push({
          type: 'thinking',
          content: content.content,
          done: content.done,
        });
        break;
      }
      case 'subagent': {
        items.push({
          type: 'subagent',
          mode: content.mode,
          agentId: content.agentId,
          nickname: content.nickname,
          task: content.task,
          agentType: content.agentType,
          thinkingLevel: content.thinkingLevel,
          workingDirectory: content.workingDirectory,
          status: content.status,
          eventBus: content.eventBus,
        });
        break;
      }
      case 'todo': {
        if (content.items.length === 0) break;
        items.push({type: 'todo', items: content.items});
        break;
      }
      case 'context-compaction-start': {
        const end = compactionEnds.get(content.compactionId);
        const error = compactionErrors.get(content.compactionId);
        if (end) {
          items.push({
            type: 'context-compaction',
            status: 'done',
            compactionId: content.compactionId,
            reason: content.reason,
            beforeTokens: content.beforeTokens,
            messageCount: content.messageCount,
            summary: end.summary,
            afterTokens: end.afterTokens,
            durationMs: end.durationMs,
          });
        } else if (error) {
          items.push({
            type: 'context-compaction',
            status: 'failed',
            compactionId: content.compactionId,
            reason: content.reason,
            beforeTokens: content.beforeTokens,
            messageCount: content.messageCount,
            errorMessage: error.message,
          });
        } else {
          items.push({
            type: 'context-compaction',
            status: 'in-progress',
            compactionId: content.compactionId,
            reason: content.reason,
            beforeTokens: content.beforeTokens,
            messageCount: content.messageCount,
          });
        }
        break;
      }
      case 'context-compaction-end':
      case 'context-compaction-error':
        // Already paired with the matching start event above.
        break;
    }
  }

  return items;
}

/**
 * View-model hook that transforms ChatMessage[] into MessageRenderItem[].
 */
export function useMessageList(messages: ChatMessage[]): MessageRenderItem[] {
  return useMemo(() => transformMessages(messages), [messages]);
}
