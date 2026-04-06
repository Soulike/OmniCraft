import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  output?: string;
}

export function ToolExecutionCard({
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  output,
}: ToolExecutionCardProps) {
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
