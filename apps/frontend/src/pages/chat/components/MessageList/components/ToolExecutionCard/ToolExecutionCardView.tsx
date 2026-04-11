import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';
import {
  editFileResultSchema,
  findFilesResultSchema,
  getCurrentTimeResultSchema,
  loadSkillResultSchema,
  readFileResultSchema,
  runCommandResultSchema,
  searchFilesResultSchema,
  toolFailureDataSchema,
  webFetchResultSchema,
  webSearchResultSchema,
  writeFileResultSchema,
} from '@omnicraft/tool-schemas';
import clsx from 'clsx';
import {CircleAlert, CircleCheck, CircleX} from 'lucide-react';
import type {ReactNode} from 'react';

import {EditFileResult} from './components/EditFileResult/index.js';
import {FindFilesResult} from './components/FindFilesResult/index.js';
import {GetCurrentTimeResult} from './components/GetCurrentTimeResult/index.js';
import {HighlightedJson} from './components/HighlightedJson/index.js';
import {LoadSkillResult} from './components/LoadSkillResult/index.js';
import {ReadFileResult} from './components/ReadFileResult/index.js';
import {RunCommandResult} from './components/RunCommandResult/index.js';
import {SearchFilesResult} from './components/SearchFilesResult/index.js';
import {WebFetchResult} from './components/WebFetchResult/index.js';
import {WebSearchResult} from './components/WebSearchResult/index.js';
import {WriteFileResult} from './components/WriteFileResult/index.js';
import styles from './styles.module.css';

interface ToolExecutionCardViewProps {
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'failure' | 'error';
  result?: string;
  output?: string;
  data?: AnyToolResultData;
}

const STATUS_ICON_SIZE = 16;

export function ToolExecutionCardView({
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  output,
  data,
}: ToolExecutionCardViewProps) {
  return (
    <div className={styles.card}>
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {status === 'running' && <Spinner size='sm' />}
            {status === 'done' && (
              <CircleCheck
                className={styles.statusDone}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'failure' && (
              <CircleAlert
                className={styles.statusFailure}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'error' && (
              <CircleX className={styles.statusError} size={STATUS_ICON_SIZE} />
            )}
            <span className={styles.toolName}>{displayName}</span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.section}>
              <span className={styles.label}>Tool</span>
              <code className={styles.code}>{toolName}</code>
            </div>
            <div className={styles.section}>
              <span className={styles.label}>Arguments</span>
              <ScrollShadow className={styles.pre}>
                <HighlightedJson jsonString={toolArguments} />
              </ScrollShadow>
            </div>
            {output !== undefined && result === undefined && (
              <div className={styles.section}>
                <span className={styles.label}>Output</span>
                <ScrollShadow className={styles.pre}>{output}</ScrollShadow>
              </div>
            )}
            <ResultSection
              data={data}
              result={result}
              status={status}
              toolArguments={toolArguments}
              toolName={toolName}
            />
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

interface ResultSectionProps {
  toolName: ToolName;
  status: 'running' | 'done' | 'failure' | 'error';
  result?: string;
  data?: AnyToolResultData;
  toolArguments: string;
}

function ResultSection({
  toolName,
  status,
  result,
  data,
  toolArguments,
}: ResultSectionProps) {
  if (result === undefined) return null;

  if (status === 'failure' || status === 'error') {
    const message = extractFailureMessage(data);
    return (
      <div className={styles.section}>
        <span className={styles.label}>Result</span>
        <ScrollShadow
          className={clsx(styles.pre, {
            [styles.preFailure]: status === 'failure',
            [styles.preError]: status === 'error',
          })}
        >
          {message}
        </ScrollShadow>
      </div>
    );
  }

  const customView = renderToolResult(toolName, data, toolArguments);

  return (
    <div className={styles.section}>
      <span className={styles.label}>Result</span>
      <ScrollShadow className={styles.pre}>
        {customView ?? <HighlightedJson jsonString={result} />}
      </ScrollShadow>
    </div>
  );
}

function renderToolResult(
  toolName: ToolName,
  data: AnyToolResultData | undefined,
  toolArguments: string,
): ReactNode {
  if (!data) return null;

  switch (toolName) {
    case 'read_file': {
      const d = readFileResultSchema.parse(data);
      return (
        <ReadFileResult
          content={d.content}
          endLine={d.endLine}
          filePath={d.filePath}
          startLine={d.startLine}
          totalLines={d.totalLines}
        />
      );
    }
    case 'write_file': {
      const d = writeFileResultSchema.parse(data);
      return (
        <WriteFileResult
          arguments={toolArguments}
          filePath={d.filePath}
          lineCount={d.lineCount}
        />
      );
    }
    case 'edit_file': {
      const d = editFileResultSchema.parse(data);
      return (
        <EditFileResult
          diff={d.diff}
          filePath={d.filePath}
          matchCount={d.matchCount}
          truncated={d.truncated}
        />
      );
    }
    case 'run_command': {
      const d = runCommandResultSchema.parse(data);
      return (
        <RunCommandResult
          command={d.command}
          cwd={d.cwd}
          exitCode={d.exitCode}
          stderr={d.stderr}
          stdout={d.stdout}
          timedOut={d.timedOut}
        />
      );
    }
    case 'search_files': {
      const d = searchFilesResultSchema.parse(data);
      return (
        <SearchFilesResult
          basePath={d.basePath}
          matches={d.matches}
          pattern={d.pattern}
          truncated={d.truncated}
        />
      );
    }
    case 'find_files': {
      const d = findFilesResultSchema.parse(data);
      return (
        <FindFilesResult
          basePath={d.basePath}
          files={d.files}
          pattern={d.pattern}
          truncated={d.truncated}
        />
      );
    }
    case 'web_search': {
      const d = webSearchResultSchema.parse(data);
      return <WebSearchResult results={d.results} />;
    }
    case 'web_fetch': {
      const d = webFetchResultSchema.parse(data);
      return <WebFetchResult content={d.content} title={d.title} url={d.url} />;
    }
    case 'get_current_time': {
      const d = getCurrentTimeResultSchema.parse(data);
      return <GetCurrentTimeResult iso={d.iso} />;
    }
    case 'load_skill': {
      const d = loadSkillResultSchema.parse(data);
      return <LoadSkillResult content={d.content} name={d.name} />;
    }
    case 'web_fetch_raw':
      return null;
  }
}

function extractFailureMessage(data: AnyToolResultData | undefined): string {
  if (!data) return 'Unknown error';
  const result = toolFailureDataSchema.safeParse(data);
  return result.success ? result.data.message : 'Unknown error';
}
