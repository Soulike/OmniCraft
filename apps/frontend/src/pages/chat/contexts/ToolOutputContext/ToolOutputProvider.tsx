import type {ReactNode} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {ToolOutputContext} from './ToolOutputContext.js';

const MAX_OUTPUT_LENGTH = 8192; // 8K characters

interface ToolOutputProviderProps {
  children: ReactNode;
}

export function ToolOutputProvider({children}: ToolOutputProviderProps) {
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

  const contextValue = useMemo(
    () => ({toolOutput: snapshot, clearToolOutput}),
    [snapshot, clearToolOutput],
  );

  return <ToolOutputContext value={contextValue}>{children}</ToolOutputContext>;
}
