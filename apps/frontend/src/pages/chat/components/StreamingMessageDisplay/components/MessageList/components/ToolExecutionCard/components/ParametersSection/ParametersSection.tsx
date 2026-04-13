import type {ToolName} from '@omnicraft/tool-schemas';
import {useMemo} from 'react';

import {HighlightedJson} from '../HighlightedJson/index.js';
import {renderToolParameters} from './helpers/renderToolParameters.js';

interface ParametersSectionProps {
  toolName: ToolName;
  toolArguments: string;
}

export function ParametersSection({
  toolName,
  toolArguments,
}: ParametersSectionProps) {
  const content = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(toolArguments);
      const rendered = renderToolParameters(toolName, parsed);
      if (rendered !== null) {
        return rendered;
      }
    } catch {
      console.warn(
        `ParametersSection: failed to parse arguments for ${toolName}, falling back to raw JSON`,
      );
    }
    return <HighlightedJson jsonString={toolArguments} />;
  }, [toolName, toolArguments]);

  return content;
}
