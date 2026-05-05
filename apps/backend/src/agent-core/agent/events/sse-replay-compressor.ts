import assert from 'node:assert';

import type {
  SseBaseEvent,
  SseEvent,
  SseSubagentOutputEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseToolExecuteDeltaEvent,
  SseUsageUpdateEvent,
} from '@omnicraft/sse-events';

type DeltaEvent =
  | SseTextDeltaEvent
  | SseThinkingDeltaEvent
  | SseToolExecuteDeltaEvent;

type MergeableEvent = DeltaEvent | SseUsageUpdateEvent;

type MergeStrategy = 'delta' | 'supersede';

type ReplayMergeTarget =
  | {
      scope: 'top-level';
      strategy: MergeStrategy;
      event: MergeableEvent;
    }
  | {
      scope: 'subagent';
      agentId: string;
      strategy: MergeStrategy;
      event: MergeableEvent;
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

  const mergedEvent = mergeEvents(currentTarget, nextTarget);
  if (currentTarget.scope === 'top-level') return mergedEvent;

  assert(current.type === 'subagent-output');
  return {
    ...current,
    event: mergedEvent,
  } satisfies SseSubagentOutputEvent;
}

function toMergeTarget(event: SseEvent): ReplayMergeTarget | null {
  if (isDeltaEvent(event)) {
    return {scope: 'top-level', strategy: 'delta', event};
  }
  if (event.type === 'usage-update') {
    return {scope: 'top-level', strategy: 'supersede', event};
  }

  if (event.type !== 'subagent-output') return null;
  if (isDeltaEvent(event.event)) {
    return {
      scope: 'subagent',
      agentId: event.agentId,
      strategy: 'delta',
      event: event.event,
    };
  }
  if (event.event.type === 'usage-update') {
    return {
      scope: 'subagent',
      agentId: event.agentId,
      strategy: 'supersede',
      event: event.event,
    };
  }
  return null;
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
  if (current.strategy !== next.strategy) return false;
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

function mergeEvents(
  current: ReplayMergeTarget,
  next: ReplayMergeTarget,
): MergeableEvent {
  if (current.strategy === 'supersede') return next.event;

  assert(isDeltaEvent(current.event) && isDeltaEvent(next.event));
  return mergeDeltaEvent(current.event, next.event);
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
