const CHARS_PER_TOKEN = 3;

export function estimatePromptTokens(value: unknown): number {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (!serialized) return 0;
  return Math.max(1, Math.ceil(serialized.length / CHARS_PER_TOKEN));
}
