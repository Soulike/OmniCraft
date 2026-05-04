export function buildCompactionPrompt(
  slimmedMessages: readonly string[],
): string {
  return [
    'Summarize the conversation history for an agent that will continue working.',
    'Preserve user goals, explicit requirements, corrections, constraints, preferences, and acceptance criteria.',
    'Preserve important files, paths, commands, tool results, errors, failures, hypotheses, decisions, pending work, and next steps.',
    'Do not invent facts. Do not weaken user instructions because they appeared early.',
    'Return only the summary text.',
    '',
    '<history_to_summarize>',
    ...slimmedMessages,
    '</history_to_summarize>',
  ].join('\n');
}

export interface BuildCompactedMessageContentOptions {
  readonly summary: string;
  readonly recentContext: string;
}

const CONTINUATION_INSTRUCTIONS =
  'Continue from this compacted state. Treat the summary and recent context as the authoritative conversation state. Preserve user requirements, constraints, and corrections. Do not repeat completed work unless needed. If task progress is tracked by available tools, inspect it when needed before planning or acting.';

export function buildCompactedMessageContent(
  options: BuildCompactedMessageContentOptions,
): string {
  return [
    '<conversation_summary>',
    options.summary,
    '</conversation_summary>',
    '',
    '<recent_context>',
    options.recentContext,
    '</recent_context>',
    '',
    '<continuation_instructions>',
    CONTINUATION_INSTRUCTIONS,
    '</continuation_instructions>',
  ].join('\n');
}
