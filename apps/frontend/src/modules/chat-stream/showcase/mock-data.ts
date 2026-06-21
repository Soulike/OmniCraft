import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseTodoItem} from '@omnicraft/sse-events';
import type {ToolFailureData, ToolResultData} from '@omnicraft/tool-schemas';

import {EventBus} from '@/helpers/event-bus.js';

import type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatEventMap,
} from '../types.js';

// --- ask_user ---

export const askUserArgsFreeText = JSON.stringify({
  questions: [
    {question: 'What should we name the new module?', options: []},
    {question: 'Describe the desired behavior in one sentence.', options: []},
  ],
});

export const askUserArgsOptions = JSON.stringify({
  questions: [
    {
      question: 'Which package manager should the script assume?',
      options: ['bun', 'npm', 'pnpm', 'yarn'],
    },
    {
      question: 'Run tests before committing?',
      options: ['Yes', 'No'],
    },
  ],
});

export const askUserDoneData: ToolResultData<'ask_user'> = {
  answers: [
    {
      question: 'Which package manager should the script assume?',
      answer: 'bun',
    },
    {question: 'Run tests before committing?', answer: 'Yes'},
  ],
};

export const askUserFailureData: ToolFailureData = {
  message: 'The user cancelled the prompt before answering.',
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const noopAskUserSubmit: AskUserSubmitHandler = async () => {};

// --- tool results ---

export const readFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/main.tsx',
});
export const readFileData: ToolResultData<'read_file'> = {
  filePath: 'apps/frontend/src/main.tsx',
  totalLines: 23,
  startLine: 1,
  endLine: 23,
  content:
    "import {StrictMode} from 'react';\nimport {createRoot} from 'react-dom/client';\n// ...",
};

export const writeFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/new-file.ts',
});
export const writeFileData: ToolResultData<'write_file'> = {
  filePath: 'apps/frontend/src/new-file.ts',
  lineCount: 42,
};

export const editFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/router/router.tsx',
});
export const editFileData: ToolResultData<'edit_file'> = {
  filePath: 'apps/frontend/src/router/router.tsx',
  matchCount: 1,
  diff: '@@ -60,3 +60,7 @@\n+      {\n+        path: ROUTES.showcase(),\n+        element: <ShowcasePage />,\n+      },',
  truncated: false,
};

export const findFilesArgs = JSON.stringify({pattern: '**/*.module.css'});
export const findFilesData: ToolResultData<'find_files'> = {
  pattern: '**/*.module.css',
  basePath: 'apps/frontend/src',
  files: [
    'apps/frontend/src/pages/chat/styles.module.css',
    'apps/frontend/src/modules/chat-stream/showcase/styles.module.css',
  ],
  truncated: false,
};

export const searchFilesArgs = JSON.stringify({pattern: 'ShowcasePage'});
export const searchFilesData: ToolResultData<'search_files'> = {
  pattern: 'ShowcasePage',
  basePath: 'apps/frontend/src',
  matches: [
    {
      file: 'apps/frontend/src/router/lazy-pages.tsx',
      line: 10,
      content: 'export const ShowcasePage = lazy(async () => {',
    },
  ],
  truncated: false,
};

export const runCommandArgs = JSON.stringify({command: 'bun run test'});
export const runCommandData: ToolResultData<'run_command'> = {
  command: 'bun run test',
  exitCode: 0,
  timedOut: false,
  cwd: '/repo/apps/frontend',
  stdout: 'Test Files  12 passed (12)\n     Tests  48 passed (48)',
  stderr: '',
};

export const webFetchArgs = JSON.stringify({url: 'https://bun.com/docs'});
export const webFetchData: ToolResultData<'web_fetch'> = {
  url: 'https://bun.com/docs',
  title: 'Bun Documentation',
  content: '# Bun\nBun is an all-in-one JavaScript runtime & toolkit...',
};

export const webSearchArgs = JSON.stringify({
  query: 'react router 7 lazy routes',
});
export const webSearchData: ToolResultData<'web_search'> = {
  results: [
    {
      title: 'Lazy Loading - React Router',
      url: 'https://reactrouter.com/start/lazy',
      score: 0.94,
      content: 'Route modules can be loaded lazily to split bundles...',
    },
  ],
};

export const loadSkillArgs = JSON.stringify({name: 'frontend-design'});
export const loadSkillData: ToolResultData<'load_skill'> = {
  name: 'frontend-design',
  content:
    '# Frontend Design\nGuidance for distinctive, intentional visual design...',
};

export const toolFailureData: ToolFailureData = {
  message: 'Command exited with code 1: file not found.',
};

// --- todo ---

export const todoItemsMixed: readonly SseTodoItem[] = [
  {
    index: 0,
    subject: 'Add Specimen wrapper',
    description: 'Caption + child',
    status: 'completed',
  },
  {
    index: 1,
    subject: 'Add ShowcaseSection',
    description: 'Titled group',
    status: 'completed',
  },
  {
    index: 2,
    subject: 'Wire mock data',
    description: 'All fixtures',
    status: 'in_progress',
  },
  {
    index: 3,
    subject: 'Register route',
    description: 'router + lazy-pages',
    status: 'pending',
  },
];

export const todoItemsComplete: readonly SseTodoItem[] = [
  {
    index: 0,
    subject: 'Add Specimen wrapper',
    description: 'Caption + child',
    status: 'completed',
  },
  {
    index: 1,
    subject: 'Add ShowcaseSection',
    description: 'Titled group',
    status: 'completed',
  },
];

// --- text / thinking / compaction ---

export const thinkingContent =
  'The user wants every card rendered statically. I should render leaf containers directly with mock props rather than feeding SSE events through the pipeline.';

export const compactionSummary =
  'Summarized the early exploration into a compact note: chat-stream cards are internal; showcase lives inside the module.';

export const userMessageShort =
  'Build a showcase page for the chat components.';

export const userMessageMarkdown =
  'Here is what I need:\n\n- Render **every** card\n- Cover all states\n- Reviewable in `light` and `dark`\n\n```ts\nconst ok = true;\n```';

export const assistantMessageMarkdown =
  "I'll build a `/showcase` route inside the `chat-stream` module.\n\n1. Specimen wrapper\n2. Section group\n3. Mock fixtures";

// --- subagent ---

export const subagentBaseProps = {
  agentId: 'agent-showcase-001',
  nickname: 'Showcase Explorer',
  task: 'Map all chat-stream components and their states for the showcase page.',
  agentType: 'Explore',
  thinkingLevel: 'medium' as ThinkingLevel,
  workingDirectory: '/repo/apps/frontend',
};

export function makeSubagentEventBus(): ChatEventBus {
  return new EventBus<ChatEventMap>();
}
