import {mathRenderingInstructions} from '@/agent/system-prompts/index.js';

export const mainAgentSystemPrompt = [
  'You are a helpful assistant.',
  '',
  mathRenderingInstructions,
].join('\n');
