import {useEffect, useRef, useState} from 'react';

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
 */
export function useStreamingText(fullContent: string): UseStreamingTextResult {
  const [displayedLength, setDisplayedLength] = useState(fullContent.length);
  const displayedLengthRef = useRef(displayedLength);
  const animationFrameIdRef = useRef(0);

  useEffect(() => {
    displayedLengthRef.current = displayedLength;
  }, [displayedLength]);

  useEffect(() => {
    if (displayedLengthRef.current >= fullContent.length) {
      return;
    }

    const tick = () => {
      setDisplayedLength((prev) => {
        const next = Math.min(prev + CHARS_PER_FRAME, fullContent.length);
        displayedLengthRef.current = next;
        return next;
      });

      if (displayedLengthRef.current < fullContent.length) {
        animationFrameIdRef.current = requestAnimationFrame(tick);
      }
    };

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
