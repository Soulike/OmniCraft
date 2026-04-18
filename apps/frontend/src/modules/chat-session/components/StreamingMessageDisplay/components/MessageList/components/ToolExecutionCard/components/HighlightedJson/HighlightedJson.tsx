import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import {useMemo} from 'react';

import {HighlightedJsonView} from './HighlightedJsonView.js';

hljs.registerLanguage('json', json);

interface HighlightedJsonProps {
  jsonString: string;
}

export function HighlightedJson({jsonString}: HighlightedJsonProps) {
  const highlightedHtml = useMemo(() => {
    const pretty = formatJson(jsonString);
    return hljs.highlight(pretty, {language: 'json'}).value;
  }, [jsonString]);

  return <HighlightedJsonView highlightedHtml={highlightedHtml} />;
}

function formatJson(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString) as unknown, null, 2);
  } catch {
    return jsonString;
  }
}
