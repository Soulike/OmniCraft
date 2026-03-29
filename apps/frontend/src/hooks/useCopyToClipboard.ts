import {useCallback, useEffect, useRef, useState} from 'react';

const RESET_DELAY_MS = 1500;

interface UseCopyToClipboardResult {
  copied: boolean;
  copy: (text: string) => void;
}

/**
 * Copies text to the clipboard. Returns a `copied` flag that stays
 * true for 1.5 seconds after a successful copy, then resets.
 */
export function useCopyToClipboard(): UseCopyToClipboardResult {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(0);

  const copy = useCallback((text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setCopied(false);
        }, RESET_DELAY_MS);
      })
      .catch((error: unknown) => {
        console.error('Failed to copy text to clipboard', error);
      });
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
    };
  }, []);

  return {copied, copy};
}
