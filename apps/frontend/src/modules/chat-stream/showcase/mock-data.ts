import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseTodoItem} from '@omnicraft/sse-events';
import type {ToolFailureData, ToolResultData} from '@omnicraft/tool-schemas';

import {EventBus} from '@/helpers/event-bus.js';
import type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatEventMap,
} from '@/modules/chat-events/index.js';

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

export const askUserErrorData: ToolFailureData = {
  message: 'Failed to deliver the prompt: the session was disconnected.',
};

export const noopAskUserSubmit: AskUserSubmitHandler = () => Promise.resolve();

/** Always rejects, to exercise AskUserCard's submit-error notice in the
 *  showcase (click Submit on that specimen to trigger it). */
export const rejectingAskUserSubmit: AskUserSubmitHandler = () =>
  Promise.reject(new Error('showcase: simulated submission failure'));

// --- tool results ---

export const readFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/main.tsx',
});
export const readFileData: ToolResultData<'read_file'> = {
  kind: 'text',
  filePath: 'apps/frontend/src/main.tsx',
  totalLines: 23,
  startLine: 1,
  endLine: 3,
  content:
    "import {StrictMode} from 'react';\nimport {createRoot} from 'react-dom/client';\n// ...",
};

export const readFileMediaArgs = JSON.stringify({
  filePath: 'apps/frontend/src/assets/logo.png',
});
export const readFileMediaData: ToolResultData<'read_file'> = {
  kind: 'image',
  filePath: 'apps/frontend/src/assets/logo.png',
  mediaType: 'image/png',
  byteSize: 245_760,
};
export const readFileMediaResult = JSON.stringify(readFileMediaData);

export const writeFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/new-file.ts',
  content: 'export const placeholder = true;\n',
});
export const writeFileData: ToolResultData<'write_file'> = {
  filePath: 'apps/frontend/src/new-file.ts',
  lineCount: 1,
};

export const editFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/router/router.tsx',
  oldString: 'path: ROUTES.coding(),',
  newString: 'path: ROUTES.showcase(),',
});
export const editFileData: ToolResultData<'edit_file'> = {
  filePath: 'apps/frontend/src/router/router.tsx',
  matchCount: 1,
  diff: '--- a/apps/frontend/src/router/router.tsx\n+++ b/apps/frontend/src/router/router.tsx\n@@ -60,0 +60,4 @@\n+      {\n+        path: ROUTES.showcase(),\n+        element: <ShowcasePage />,\n+      },',
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
      line: 13,
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

export const webFetchRawArgs = JSON.stringify({
  url: 'https://bun.com/llms.txt',
});
export const webFetchRawData: ToolResultData<'web_fetch_raw'> = {
  url: 'https://bun.com/llms.txt',
  content: '<!doctype html>\n<html><head><title>Bun</title></head>...',
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

export const getCurrentTimeArgs = JSON.stringify({});
export const getCurrentTimeData: ToolResultData<'get_current_time'> = {
  iso: '2026-06-21T08:00:00.000Z',
};

export const toolFailureData: ToolFailureData = {
  message: 'Command exited with code 1: file not found.',
};

// Raw `result` strings. ToolExecutionCard only renders its Result section when
// `result` is defined; with `data` present the rich sub-renderer reads `data`
// and the string is just the gate plus a parse-failure fallback. Each mirrors
// its own `data` so the fallback path stays faithful too.
export const readFileResult = JSON.stringify(readFileData);
export const writeFileResult = JSON.stringify(writeFileData);
export const editFileResult = JSON.stringify(editFileData);
export const findFilesResult = JSON.stringify(findFilesData);
export const searchFilesResult = JSON.stringify(searchFilesData);
export const runCommandResult = JSON.stringify(runCommandData);
export const webFetchResult = JSON.stringify(webFetchData);
export const webFetchRawResult = JSON.stringify(webFetchRawData);
export const webSearchResult = JSON.stringify(webSearchData);
export const loadSkillResult = JSON.stringify(loadSkillData);
export const getCurrentTimeResult = JSON.stringify(getCurrentTimeData);
export const toolFailureResult = JSON.stringify(toolFailureData);

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
  thinkingLevel: 'medium',
  workingDirectory: '/repo/apps/frontend',
} satisfies {
  agentId: string;
  nickname: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
};

export function makeSubagentEventBus(): ChatEventBus {
  return new EventBus<ChatEventMap>();
}
