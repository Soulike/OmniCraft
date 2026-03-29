/**
 * Extracts the language name from the code element's className.
 * rehype-highlight adds classes like "hljs language-javascript".
 */
export function extractLanguage(
  className: string | undefined,
): string | undefined {
  if (!className) {
    return undefined;
  }
  const match = /language-(\S+)/.exec(className);
  return match?.[1];
}
