export function buildCompactionPrompt(
  slimmedMessages: readonly string[],
): string {
  return [
    'Summarize the earlier conversation history for an agent that will continue working.',
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
