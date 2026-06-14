import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

export const mainAgentSystemPrompt = [
  'You are a helpful assistant.',
  '',
  preambleInstructions,
  '',
  mathRenderingInstructions,
].join('\n');
