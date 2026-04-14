import type {ToolName} from '@omnicraft/tool-schemas';
import {
  editFileParametersSchema,
  findFilesParametersSchema,
  loadSkillParametersSchema,
  readFileParametersSchema,
  runCommandParametersSchema,
  searchFilesParametersSchema,
  webFetchParametersSchema,
  webFetchRawParametersSchema,
  webSearchParametersSchema,
  writeFileParametersSchema,
} from '@omnicraft/tool-schemas';
import type {ReactNode} from 'react';

import {EditFileParameters} from '../components/EditFileParameters/index.js';
import {FindFilesParameters} from '../components/FindFilesParameters/index.js';
import {LoadSkillParameters} from '../components/LoadSkillParameters/index.js';
import {ReadFileParameters} from '../components/ReadFileParameters/index.js';
import {RunCommandParameters} from '../components/RunCommandParameters/index.js';
import {SearchFilesParameters} from '../components/SearchFilesParameters/index.js';
import {WebFetchParameters} from '../components/WebFetchParameters/index.js';
import {WebFetchRawParameters} from '../components/WebFetchRawParameters/index.js';
import {WebSearchParameters} from '../components/WebSearchParameters/index.js';
import {WriteFileParameters} from '../components/WriteFileParameters/index.js';

export function renderToolParameters(
  toolName: ToolName,
  parsed: unknown,
): ReactNode | null {
  switch (toolName) {
    case 'read_file': {
      const d = readFileParametersSchema.parse(parsed);
      return (
        <ReadFileParameters
          filePath={d.filePath}
          lineCount={d.lineCount}
          startLine={d.startLine}
        />
      );
    }
    case 'write_file': {
      const d = writeFileParametersSchema.parse(parsed);
      return <WriteFileParameters filePath={d.filePath} />;
    }
    case 'edit_file': {
      const d = editFileParametersSchema.parse(parsed);
      return (
        <EditFileParameters
          filePath={d.filePath}
          newString={d.newString}
          oldString={d.oldString}
          replaceAll={d.replaceAll}
        />
      );
    }
    case 'find_files': {
      const d = findFilesParametersSchema.parse(parsed);
      return <FindFilesParameters path={d.path} pattern={d.pattern} />;
    }
    case 'search_files': {
      const d = searchFilesParametersSchema.parse(parsed);
      return (
        <SearchFilesParameters
          filePattern={d.filePattern}
          path={d.path}
          pattern={d.pattern}
        />
      );
    }
    case 'run_command': {
      const d = runCommandParametersSchema.parse(parsed);
      return <RunCommandParameters command={d.command} timeout={d.timeout} />;
    }
    case 'web_search': {
      const d = webSearchParametersSchema.parse(parsed);
      return (
        <WebSearchParameters
          excludeDomains={d.excludeDomains}
          includeDomains={d.includeDomains}
          maxResults={d.maxResults}
          query={d.query}
        />
      );
    }
    case 'web_fetch': {
      const d = webFetchParametersSchema.parse(parsed);
      return (
        <WebFetchParameters includeFullPage={d.includeFullPage} url={d.url} />
      );
    }
    case 'web_fetch_raw': {
      const d = webFetchRawParametersSchema.parse(parsed);
      return <WebFetchRawParameters url={d.url} />;
    }
    case 'load_skill': {
      const d = loadSkillParametersSchema.parse(parsed);
      return <LoadSkillParameters name={d.name} />;
    }
    case 'get_current_time':
    case 'ask_user':
      return null;
  }
}
