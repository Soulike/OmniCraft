import {type ReactNode, useCallback, useMemo} from 'react';

import {useCopyToClipboard} from '@/hooks/useCopyToClipboard.js';

import {CodeBlockView} from './CodeBlockView.js';
import {assertCodeElement} from './helpers/assertCodeElement.js';
import {extractLanguage} from './helpers/extractLanguage.js';
import {extractText} from './helpers/extractText.js';

interface CodeBlockProps {
  children: ReactNode;
}

/**
 * Container for fenced code blocks rendered by react-markdown.
 * react-markdown renders `<pre><code className="language-xxx">...</code></pre>`.
 * This component intercepts `<pre>` and extracts language + raw text.
 */
export function CodeBlock({children}: CodeBlockProps) {
  assertCodeElement(children);

  const {className, children: codeChildren} = children.props;

  const language = extractLanguage(className);
  const rawText = useMemo(
    // Markdown fenced code blocks produce a trailing \n; strip it
    // so the line count doesn't include a phantom empty line.
    () => extractText(codeChildren).replace(/\n$/, ''),
    [codeChildren],
  );
  const lineCount = useMemo(() => rawText.split('\n').length, [rawText]);

  const {copied, copy} = useCopyToClipboard();

  const handleCopy = useCallback(() => {
    copy(rawText);
  }, [copy, rawText]);

  return (
    <CodeBlockView
      codeContent={children}
      copied={copied}
      language={language}
      lineCount={lineCount}
      onCopy={handleCopy}
    />
  );
}
