import {
  sseBaseEventSchema,
  type SseEvent,
  type SseSubagentDispatchEvent,
  type SseSubagentOutputEvent,
  type SseSubagentResumeEvent,
} from '@omnicraft/sse-events';

import type {Agent} from '@/agent-core/agent/index.js';
import type {
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

export interface SubagentTurnResult {
  summary: string;
}

export interface RunSubagentTurnInput {
  readonly context: ToolExecutionContext;
  readonly subagent: Agent;
  readonly task: string;
  readonly startEvent: SseSubagentDispatchEvent | SseSubagentResumeEvent;
  readonly onTurnStarted?: () => void;
}

export function buildSubagentOutputEvent(
  agentId: string,
  event: SseEvent,
): SseSubagentOutputEvent {
  const baseEvent = sseBaseEventSchema.parse(event);
  return {
    type: 'subagent-output',
    agentId,
    event: baseEvent,
  };
}

export async function runSubagentTurn({
  context,
  subagent,
  task,
  startEvent,
  onTurnStarted,
}: RunSubagentTurnInput): Promise<ToolExecuteResult<SubagentTurnResult>> {
  const onAbort = () => {
    subagent.abort();
  };
  context.signal.addEventListener('abort', onAbort, {once: true});
  context.onSubAgentEvent(startEvent);

  try {
    let lastReplyText = '';
    let completed = false;
    let failureMessage: string | null = null;
    const eventIter = subagent.subscribe({signal: context.signal});

    subagent.handleUserMessage(task);
    onTurnStarted?.();

    for await (const entry of eventIter) {
      const {event} = entry;
      context.onSubAgentEvent(buildSubagentOutputEvent(subagent.id, event));

      if (event.type === 'message-start' && event.role === 'assistant') {
        lastReplyText = '';
      }
      if (event.type === 'text-delta') {
        lastReplyText += event.content;
      }
      if (event.type === 'error') {
        failureMessage = event.message;
        break;
      }
      // Subagent's sseLog is never sealed; break on done to end iteration.
      // If the parent aborts, the reader ends silently without a done event.
      if (event.type === 'done') {
        completed = true;
        break;
      }
    }

    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: subagent.id,
      status: completed ? 'success' : 'failure',
    });

    if (completed) {
      const summary =
        lastReplyText ||
        'Subagent completed the task but produced no text summary.';
      return {data: {summary}, content: summary, status: 'success'};
    }

    if (failureMessage) {
      return {
        data: {message: `Subagent error: ${failureMessage}`},
        content: `Subagent error: ${failureMessage}`,
        status: 'failure',
      };
    }

    return {
      data: {message: 'Subagent was aborted'},
      content: 'Subagent was aborted.',
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
      content: `Subagent error: ${message}`,
      status: 'failure',
    };
  } finally {
    context.signal.removeEventListener('abort', onAbort);
  }
}
