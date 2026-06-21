import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';

import {useToolOutput} from '../../../../contexts/ToolOutputContext/index.js';
import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  callId: string;
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'failure' | 'error';
  result?: string;
  data?: AnyToolResultData;
}

export function ToolExecutionCard({
  callId,
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  data,
}: ToolExecutionCardProps) {
  const output = useToolOutput(callId);

  return (
    <ToolExecutionCardView
      toolName={toolName}
      displayName={displayName}
      arguments={toolArguments}
      status={status}
      result={result}
      output={output}
      data={data}
    />
  );
}
