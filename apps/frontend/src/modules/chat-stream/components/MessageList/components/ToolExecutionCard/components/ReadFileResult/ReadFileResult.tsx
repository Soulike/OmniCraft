import hljs from 'highlight.js';
import {useMemo} from 'react';

import {ReadFileResultView} from './ReadFileResultView.js';

interface ReadFileResultProps {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
}

export function ReadFileResult({
  filePath,
  content,
  startLine,
  endLine,
  totalLines,
}: ReadFileResultProps) {
  const language = useMemo(() => inferLanguage(filePath), [filePath]);

  const highlightedHtml = useMemo(() => {
    if (language) {
      try {
        return hljs.highlight(content, {language}).value;
      } catch {
        // Language not registered, fall through to auto
      }
    }
    return hljs.highlightAuto(content).value;
  }, [content, language]);

  const lineCount = endLine - startLine + 1;

  return (
    <ReadFileResultView
      filePath={filePath}
      highlightedHtml={highlightedHtml}
      lineCount={lineCount}
      startLine={startLine}
      totalLines={totalLines}
    />
  );
}

function inferLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;

  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    html: 'xml',
    xml: 'xml',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    sql: 'sql',
    rb: 'ruby',
    php: 'php',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
  };

  return map[ext];
}
