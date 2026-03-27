import {useEffect, useRef, useState} from 'react';

/** Target reveal speed in characters per second, independent of refresh rate. */
const CHARS_PER_SECOND = 120;

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
  const animationFrameIdRef = useRef(0);
  const previousFullContentRef = useRef(fullContent);
  const lastFrameTimeRef = useRef(0);

  useEffect(() => {
    displayedLengthRef.current = displayedLength;
  }, [displayedLength]);

  // Reset displayedLength when content is replaced rather than appended.
  useEffect(() => {
    const previousFullContent = previousFullContentRef.current;

    if (!fullContent.startsWith(previousFullContent)) {
      setDisplayedLength(fullContent.length);
      displayedLengthRef.current = fullContent.length;
    }

    previousFullContentRef.current = fullContent;
  }, [fullContent]);

  useEffect(() => {
    if (displayedLengthRef.current >= fullContent.length) {
      return;
    }

    const tick = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      const charsToReveal = Math.max(
        1,
        Math.round((elapsed / 1000) * CHARS_PER_SECOND),
      );

      setDisplayedLength((prev) => {
        const next = Math.min(prev + charsToReveal, fullContent.length);
        displayedLengthRef.current = next;
        return next;
      });

      if (displayedLengthRef.current < fullContent.length) {
        animationFrameIdRef.current = requestAnimationFrame(tick);
      }
    };

    lastFrameTimeRef.current = 0;
    animationFrameIdRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [fullContent.length]);

  return {
    displayedContent: fullContent.slice(0, displayedLength),
    isAnimating: displayedLength < fullContent.length,
  };
}
