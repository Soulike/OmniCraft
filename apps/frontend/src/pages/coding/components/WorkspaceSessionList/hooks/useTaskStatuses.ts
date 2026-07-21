import type {SessionMetadata} from '@omnicraft/api-schema';
import {useEffect, useMemo, useRef, useState} from 'react';

import type {TaskStatus} from '@/components/TaskStatusIndicator/index.js';

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/**
 * Derives a per-session TaskStatus from the polled session list. `running` and
 * `idle` come straight from the backend `isRunning` flag; `done` is client-only,
 * raised when a non-selected session transitions running → idle and cleared when
 * it is selected (acknowledged), runs again, or leaves the list. `waiting` is not
 * produced yet — its data source is tracked in #354; once available it slots
 * ahead of `done`.
 */
export function useTaskStatuses(
  sessions: readonly SessionMetadata[],
  selectedId: string | null,
): ReadonlyMap<string, TaskStatus> {
  const currentRunning = useMemo(
    () => new Set(sessions.filter((s) => s.isRunning).map((s) => s.id)),
    [sessions],
  );
  const presentIds = useMemo(
    () => new Set(sessions.map((s) => s.id)),
    [sessions],
  );

  const prevRunningRef = useRef<ReadonlySet<string>>(new Set());
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const prevRunning = prevRunningRef.current;
    setDoneIds((prevDone) => {
      const next = new Set(prevDone);
      for (const id of prevRunning) {
        if (
          !currentRunning.has(id) &&
          presentIds.has(id) &&
          id !== selectedId
        ) {
          next.add(id);
        }
      }
      for (const id of [...next]) {
        if (
          currentRunning.has(id) ||
          id === selectedId ||
          !presentIds.has(id)
        ) {
          next.delete(id);
        }
      }
      return sameSet(next, prevDone) ? prevDone : next;
    });
    prevRunningRef.current = currentRunning;
  }, [currentRunning, presentIds, selectedId]);

  return useMemo(() => {
    const map = new Map<string, TaskStatus>();
    for (const s of sessions) {
      const status: TaskStatus = currentRunning.has(s.id)
        ? 'running'
        : doneIds.has(s.id)
          ? 'done'
          : 'idle';
      map.set(s.id, status);
    }
    return map;
  }, [sessions, currentRunning, doneIds]);
}
