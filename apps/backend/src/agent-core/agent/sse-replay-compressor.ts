import assert from 'node:assert';

import type {
  SseBaseEvent,
  SseEvent,
  SseSubagentOutputEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseToolExecuteDeltaEvent,
} from '@omnicraft/sse-events';

type DeltaEvent =
  | SseTextDeltaEvent
  | SseThinkingDeltaEvent
  | SseToolExecuteDeltaEvent;

type ReplayMergeTarget =
  | {
      scope: 'top-level';
      event: DeltaEvent;
    }
  | {
      scope: 'subagent';
      agentId: string;
      event: DeltaEvent;
    };

function canMerge(current: SseEvent, next: SseEvent): boolean {
  const currentTarget = toMergeTarget(current);
  if (!currentTarget) return false;

  const nextTarget = toMergeTarget(next);
  if (!nextTarget) return false;

  return areTargetsCompatible(currentTarget, nextTarget);
}

function merge(current: SseEvent, next: SseEvent): SseEvent {
  const currentTarget = toMergeTarget(current);
  const nextTarget = toMergeTarget(next);
  assert(currentTarget, 'Current replay event is not mergeable');
  assert(nextTarget, 'Next replay event is not mergeable');
  assert(
    areTargetsCompatible(currentTarget, nextTarget),
    'Replay events are not compatible for merging',
  );

  const mergedEvent = mergeDeltaEvent(currentTarget.event, nextTarget.event);
  if (currentTarget.scope === 'top-level') return mergedEvent;

  assert(current.type === 'subagent-output');
  return {
    ...current,
    event: mergedEvent,
  } satisfies SseSubagentOutputEvent;
}

function toMergeTarget(event: SseEvent): ReplayMergeTarget | null {
  if (isDeltaEvent(event)) {
    return {scope: 'top-level', event};
  }

  if (event.type !== 'subagent-output') return null;
  if (!isDeltaEvent(event.event)) return null;

  return {
    scope: 'subagent',
    agentId: event.agentId,
    event: event.event,
  };
}

function isDeltaEvent(event: SseEvent | SseBaseEvent): event is DeltaEvent {
  return (
    event.type === 'text-delta' ||
    event.type === 'thinking-delta' ||
    event.type === 'tool-execute-delta'
  );
}

function areTargetsCompatible(
  current: ReplayMergeTarget,
  next: ReplayMergeTarget,
): boolean {
  if (current.scope !== next.scope) return false;
  if (
    current.scope === 'subagent' &&
    next.scope === 'subagent' &&
    current.agentId !== next.agentId
  ) {
    return false;
  }

  if (current.event.type !== next.event.type) return false;
  if (
    current.event.type === 'tool-execute-delta' &&
    next.event.type === 'tool-execute-delta'
  ) {
    return current.event.callId === next.event.callId;
  }

  return true;
}

function mergeDeltaEvent(current: DeltaEvent, next: DeltaEvent): DeltaEvent {
  switch (current.type) {
    case 'text-delta':
      assert(next.type === 'text-delta');
      return {...current, content: current.content + next.content};
    case 'thinking-delta':
      assert(next.type === 'thinking-delta');
      return {...current, content: current.content + next.content};
    case 'tool-execute-delta':
      assert(next.type === 'tool-execute-delta');
      assert(current.callId === next.callId);
      return {...current, content: current.content + next.content};
  }
}

export const sseReplayCompressor = {
  canMerge,
  merge,
};
