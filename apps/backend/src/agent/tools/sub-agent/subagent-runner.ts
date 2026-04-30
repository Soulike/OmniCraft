import {type ThinkingLevel} from '@omnicraft/api-schema';
import {
  sseBaseEventSchema,
  type SseEventCursorEntry,
} from '@omnicraft/sse-events';

import type {Agent} from '@/agent-core/agent/index.js';
import type {
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import type {DispatchAgentResult, SubAgentType} from './subagent-types.js';

export type RunnableSubagent = Pick<
  Agent,
  'id' | 'abort' | 'handleUserMessage' | 'subscribe'
>;

export async function runSubagentTurn(params: {
  subagent: RunnableSubagent;
  task: string;
  agentType: SubAgentType;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  context: ToolExecutionContext;
  subagentSseEventStartIndex?: number;
}): Promise<ToolExecuteResult<DispatchAgentResult>> {
  const {
    subagent,
    task,
    agentType,
    thinkingLevel,
    workingDirectory,
    context,
    subagentSseEventStartIndex,
  } = params;

  const onAbort = () => {
    subagent.abort();
  };
  context.signal.addEventListener('abort', onAbort, {once: true});

  context.onSubAgentEvent({
    type: 'subagent-dispatch',
    agentId: subagent.id,
    task,
    agentType,
    thinkingLevel,
    workingDirectory,
  });

  try {
    if (context.signal.aborted) {
      subagent.abort();
      return completeWithFailure(
        context,
        subagent.id,
        agentType,
        'Subagent was aborted before it started.',
      );
    }

    let lastReplyText = '';
    let failureMessage: string | null = null;
    let completedSuccessfully = false;
    const eventIter: AsyncIterable<SseEventCursorEntry> = subagent.subscribe({
      startIndex: subagentSseEventStartIndex,
      signal: context.signal,
    });

    subagent.handleUserMessage(task);

    for await (const entry of eventIter) {
      const {event} = entry;
      const baseEvent = sseBaseEventSchema.safeParse(event);
      if (baseEvent.success) {
        context.onSubAgentEvent({
          type: 'subagent-output',
          agentId: subagent.id,
          event: baseEvent.data,
        });
      }

      if (event.type === 'message-start' && event.role === 'assistant') {
        lastReplyText = '';
      }
      if (event.type === 'text-delta') {
        lastReplyText += event.content;
      }
      if (event.type === 'error') {
        failureMessage = `Subagent error: ${event.message}`;
        break;
      }
      if (event.type === 'done') {
        if (event.reason === 'complete') {
          completedSuccessfully = true;
        } else {
          failureMessage = getDoneFailureMessage(event.reason);
        }
        break;
      }
    }

    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: subagent.id,
      status: completedSuccessfully ? 'success' : 'failure',
    });

    if (completedSuccessfully) {
      const summary =
        lastReplyText ||
        'Subagent completed the task but produced no text summary.';
      return {
        data: {subagentId: subagent.id, agentType, summary},
        content: formatSubagentResult(subagent.id, agentType, summary),
        status: 'success',
      };
    }

    const message = failureMessage ?? 'Subagent was aborted.';
    return {
      data: {message},
      content: formatSubagentFailure(subagent.id, agentType, message),
      status: 'failure',
    };
  } catch (error: unknown) {
    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: subagent.id,
      status: 'failure',
    });

    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {message: `Subagent error: ${message}`},
      content: formatSubagentFailure(
        subagent.id,
        agentType,
        `Subagent error: ${message}`,
      ),
      status: 'failure',
    };
  } finally {
    context.signal.removeEventListener('abort', onAbort);
  }
}

function completeWithFailure(
  context: ToolExecutionContext,
  subagentId: string,
  agentType: SubAgentType,
  message: string,
): ToolExecuteResult<DispatchAgentResult> {
  context.onSubAgentEvent({
    type: 'subagent-complete',
    agentId: subagentId,
    status: 'failure',
  });

  return {
    data: {message},
    content: formatSubagentFailure(subagentId, agentType, message),
    status: 'failure',
  };
}

function getDoneFailureMessage(
  reason: 'aborted' | 'max_rounds_reached',
): 'Subagent was aborted.' | 'Subagent reached the maximum tool rounds.' {
  switch (reason) {
    case 'aborted':
      return 'Subagent was aborted.';
    case 'max_rounds_reached':
      return 'Subagent reached the maximum tool rounds.';
  }
}

function formatSubagentResult(
  subagentId: string,
  agentType: SubAgentType,
  summary: string,
): string {
  return `Subagent completed.\nid: ${subagentId}\ntype: ${agentType}\n\n${summary}`;
}

function formatSubagentFailure(
  subagentId: string,
  agentType: SubAgentType,
  summary: string,
): string {
  return `Subagent failed.\nid: ${subagentId}\ntype: ${agentType}\n\n${summary}`;
}
