import {useCallback, useEffect, useRef, useState} from 'react';

import {useChatEventBus} from './useChatEventBus.js';

const MAX_OUTPUT_BYTES = 8192; // 8 KB

/**
 * Manages streaming tool output, accumulating delta chunks per callId.
 * Truncates to the most recent 8 KB per tool. Re-renders are throttled
 * to once per animation frame.
 */
export function useToolOutput() {
  const [toolOutput] = useState(() => new Map<string, string>());
  const rafIdRef = useRef<number | null>(null);
  const [, forceRender] = useState(0);
  const eventBus = useChatEventBus();

  const scheduleRender = useCallback(() => {
    rafIdRef.current ??= requestAnimationFrame(() => {
      rafIdRef.current = null;
      forceRender((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    const onDelta = (data: {callId: string; content: string}) => {
      const current = toolOutput.get(data.callId) ?? '';
      const updated = current + data.content;
      toolOutput.set(
        data.callId,
        updated.length > MAX_OUTPUT_BYTES
          ? updated.slice(updated.length - MAX_OUTPUT_BYTES)
          : updated,
      );
      scheduleRender();
    };

    const onEnd = (data: {callId: string}) => {
      toolOutput.delete(data.callId);
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
  }, [eventBus, scheduleRender, toolOutput]);

  const clearToolOutput = useCallback(() => {
    toolOutput.clear();
  }, [toolOutput]);

  return {toolOutput, clearToolOutput};
}
