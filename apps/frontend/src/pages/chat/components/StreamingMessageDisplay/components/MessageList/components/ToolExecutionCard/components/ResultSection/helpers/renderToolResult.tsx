import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';
import {
  editFileResultSchema,
  findFilesResultSchema,
  getCurrentTimeResultSchema,
  loadSkillResultSchema,
  readFileResultSchema,
  runCommandResultSchema,
  searchFilesResultSchema,
  webFetchResultSchema,
  webSearchResultSchema,
  writeFileResultSchema,
} from '@omnicraft/tool-schemas';
import type {ReactNode} from 'react';

import {EditFileResult} from '../../EditFileResult/index.js';
import {FindFilesResult} from '../../FindFilesResult/index.js';
import {GetCurrentTimeResult} from '../../GetCurrentTimeResult/index.js';
import {HighlightedJson} from '../../HighlightedJson/index.js';
import {LoadSkillResult} from '../../LoadSkillResult/index.js';
import {ReadFileResult} from '../../ReadFileResult/index.js';
import {RunCommandResult} from '../../RunCommandResult/index.js';
import {SearchFilesResult} from '../../SearchFilesResult/index.js';
import {WebFetchResult} from '../../WebFetchResult/index.js';
import {WebSearchResult} from '../../WebSearchResult/index.js';
import {WriteFileResult} from '../../WriteFileResult/index.js';

export function renderToolResult(
  toolName: ToolName,
  result: string,
  data: AnyToolResultData | undefined,
  toolArguments: string,
): ReactNode {
  if (!data) {
    return <HighlightedJson jsonString={result} />;
  }

  try {
    return renderToolResultUnsafe(toolName, data, toolArguments);
  } catch {
    return <HighlightedJson jsonString={result} />;
  }
}

function renderToolResultUnsafe(
  toolName: ToolName,
  data: AnyToolResultData,
  toolArguments: string,
): ReactNode {
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
      return <HighlightedJson jsonString={JSON.stringify(data, null, 2)} />;
    case 'ask_user':
      throw new Error(
        'ask_user is a client-side tool and should not reach renderToolResult',
      );
  }
}
