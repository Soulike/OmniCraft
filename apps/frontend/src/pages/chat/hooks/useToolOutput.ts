import {useCallback, useEffect, useRef, useState} from 'react';

import {useChatEventBus} from './useChatEventBus.js';

const MAX_OUTPUT_LENGTH = 8192; // 8K characters

/**
 * Manages streaming tool output, accumulating delta chunks per callId.
 * Truncates to the most recent 8 KB per tool. Re-renders are throttled
 * to once per animation frame. Each render produces a new Map snapshot
 * so downstream components detect the change via reference comparison.
 */
export function useToolOutput() {
  const mapRef = useRef(new Map<string, string>());
  const rafIdRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const eventBus = useChatEventBus();

  const scheduleRender = useCallback(() => {
    rafIdRef.current ??= requestAnimationFrame(() => {
      rafIdRef.current = null;
      setSnapshot(new Map(mapRef.current));
    });
  }, []);

  useEffect(() => {
    const onDelta = (data: {callId: string; content: string}) => {
      const current = mapRef.current.get(data.callId) ?? '';
      const updated = current + data.content;
      mapRef.current.set(
        data.callId,
        updated.length > MAX_OUTPUT_LENGTH
          ? updated.slice(updated.length - MAX_OUTPUT_LENGTH)
          : updated,
      );
      scheduleRender();
    };

    const onEnd = (data: {callId: string}) => {
      mapRef.current.delete(data.callId);
      scheduleRender();
    };

    eventBus.on('tool-execute-delta', onDelta);
    eventBus.on('tool-execute-end', onEnd);

    return () => {
      eventBus.off('tool-execute-delta', onDelta);
      eventBus.off('tool-execute-end', onEnd);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [eventBus, scheduleRender]);

  const clearToolOutput = useCallback(() => {
    mapRef.current.clear();
    setSnapshot(new Map());
  }, []);

  return {toolOutput: snapshot, clearToolOutput};
}
