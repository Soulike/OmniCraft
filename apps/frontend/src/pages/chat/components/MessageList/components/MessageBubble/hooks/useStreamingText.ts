import {useCallback, useEffect, useRef, useState} from 'react';

const CHARS_PER_FRAME = 2;

interface UseStreamingTextResult {
  displayedContent: string;
  isAnimating: boolean;
}

/**
 * Smoothly reveals text character-by-character using requestAnimationFrame.
 *
 * Content present at mount is shown instantly (history messages).
 * Content that grows after mount is animated (streaming tokens).
 * If content is replaced (not appended to), the new content is shown instantly.
 */
export function useStreamingText(fullContent: string): UseStreamingTextResult {
  const [displayedLength, setDisplayedLength] = useState(fullContent.length);
  const displayedLengthRef = useRef(displayedLength);
  const targetLengthRef = useRef(fullContent.length);
  const animationFrameIdRef = useRef(0);
  const isLoopRunningRef = useRef(false);
  const previousFullContentRef = useRef(fullContent);

  const startLoop = useCallback(() => {
    if (isLoopRunningRef.current) {
      return;
    }
    isLoopRunningRef.current = true;

    const tick = () => {
      setDisplayedLength((prev) => {
        const next = Math.min(prev + CHARS_PER_FRAME, targetLengthRef.current);
        displayedLengthRef.current = next;
        return next;
      });

      if (displayedLengthRef.current < targetLengthRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(tick);
      } else {
        isLoopRunningRef.current = false;
      }
    };

    animationFrameIdRef.current = requestAnimationFrame(tick);
  }, []);

  // Track content changes: reset on replacement, animate on append.
  useEffect(() => {
    const previousFullContent = previousFullContentRef.current;

    if (!fullContent.startsWith(previousFullContent)) {
      cancelAnimationFrame(animationFrameIdRef.current);
      isLoopRunningRef.current = false;
      setDisplayedLength(fullContent.length);
      displayedLengthRef.current = fullContent.length;
      targetLengthRef.current = fullContent.length;
    } else if (fullContent.length > targetLengthRef.current) {
      targetLengthRef.current = fullContent.length;
      startLoop();
    }

    previousFullContentRef.current = fullContent;
  }, [fullContent, startLoop]);

  // Cancel animation on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, []);

  return {
    displayedContent: fullContent.slice(0, displayedLength),
    isAnimating: displayedLength < fullContent.length,
  };
}
