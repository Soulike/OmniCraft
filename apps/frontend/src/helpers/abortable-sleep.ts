/**
 * Returns a promise that resolves to `true` after {@link ms} milliseconds,
 * or `false` if the {@link signal} is aborted before the timer fires.
 */
export function abortableSleep(
  ms: number,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', onAbort, {once: true});
  });
}
