import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

export const generalSubAgentSystemPrompt = [
  'You are a helpful assistant working on a delegated subtask. ' +
    'After completing your task, provide a concise summary of what you did and the results.',
  '',
  preambleInstructions,
  '',
  mathRenderingInstructions,
].join('\n');
