import {useMemo} from 'react';

import {SearchFilesResultView} from './SearchFilesResultView.js';

interface SearchFilesResultProps {
  pattern: string;
  basePath: string;
  matches: readonly {file: string; line: number; content: string}[];
  truncated: boolean;
}

export interface FileGroup {
  file: string;
  matches: readonly {line: number; content: string}[];
}

export function SearchFilesResult({
  pattern,
  basePath,
  matches,
  truncated,
}: SearchFilesResultProps) {
  const groups = useMemo(() => groupByFile(matches), [matches]);

  return (
    <SearchFilesResultView
      basePath={basePath}
      groups={groups}
      pattern={pattern}
      totalMatches={matches.length}
      truncated={truncated}
    />
  );
}

function groupByFile(
  matches: readonly {file: string; line: number; content: string}[],
): FileGroup[] {
  const map = new Map<string, {line: number; content: string}[]>();
  for (const m of matches) {
    let group = map.get(m.file);
    if (!group) {
      group = [];
      map.set(m.file, group);
    }
    group.push({line: m.line, content: m.content});
  }
  return Array.from(map.entries(), ([file, fileMatches]) => ({
    file,
    matches: fileMatches,
  }));
}
