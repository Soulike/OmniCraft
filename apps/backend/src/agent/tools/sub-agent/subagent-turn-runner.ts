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
  agentId: string;
}

export interface RunSubagentTurnInput {
  readonly context: ToolExecutionContext;
  readonly subagent: Agent;
  /** Readable handle surfaced to the caller in the turn's output. */
  readonly nickname: string;
  readonly startEvent: SseSubagentDispatchEvent | SseSubagentResumeEvent;
  /**
   * Starts the subagent turn. Returns false when the subagent is busy and the
   * turn must be rejected. Dispatch always returns true; resume delegates to
   * the subagent's start-only-if-idle claim.
   */
  readonly startTurn: () => boolean;
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
  nickname,
  startEvent,
  startTurn,
  onTurnStarted,
}: RunSubagentTurnInput): Promise<ToolExecuteResult<SubagentTurnResult>> {
  const onAbort = () => {
    subagent.abort();
  };
  context.signal.addEventListener('abort', onAbort, {once: true});

  try {
    const startIndex = subagent.getSseEventCount();

    if (context.signal.aborted) {
      context.onSubAgentEvent(startEvent);
      context.onSubAgentEvent({
        type: 'subagent-complete',
        agentId: subagent.id,
        status: 'failure',
      });

      return {
        data: {message: 'Subagent was aborted'},
        content: [{type: 'text', text: 'Subagent was aborted.'}],
        status: 'failure',
      };
    }

    if (!startTurn()) {
      const message =
        `Subagent ${nickname} is already running. ` +
        'Wait for it to finish before resuming it.';
      return {
        data: {message},
        content: [{type: 'text', text: message}],
        status: 'failure',
      };
    }

    context.onSubAgentEvent(startEvent);

    let lastReplyText = '';
    let completed = false;
    let failureMessage: string | null = null;
    const eventIter = subagent.subscribe({
      startIndex,
      signal: context.signal,
    });

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
      const content = `<subagent_name>${nickname}</subagent_name>\n\n${summary}`;
      return {
        data: {summary, agentId: subagent.id},
        content: [{type: 'text', text: content}],
        status: 'success',
      };
    }

    if (failureMessage) {
      return {
        data: {message: `Subagent error: ${failureMessage}`},
        content: [{type: 'text', text: `Subagent error: ${failureMessage}`}],
        status: 'failure',
      };
    }

    return {
      data: {message: 'Subagent was aborted'},
      content: [{type: 'text', text: 'Subagent was aborted.'}],
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
      content: [{type: 'text', text: `Subagent error: ${message}`}],
      status: 'failure',
    };
  } finally {
    context.signal.removeEventListener('abort', onAbort);
  }
}
