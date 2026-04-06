import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  toolOutput: ReadonlyMap<string, string>;
}

export function ToolExecutionCard({
  callId,
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  toolOutput,
}: ToolExecutionCardProps) {
  const output = toolOutput.get(callId);

  return (
    <ToolExecutionCardView
      toolName={toolName}
      displayName={displayName}
      arguments={toolArguments}
      status={status}
      result={result}
      output={output}
    />
  );
}
