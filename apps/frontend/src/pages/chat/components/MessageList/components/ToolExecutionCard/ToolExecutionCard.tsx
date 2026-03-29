import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export function ToolExecutionCard({
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
}: ToolExecutionCardProps) {
  return (
    <ToolExecutionCardView
      toolName={toolName}
      displayName={displayName}
      arguments={toolArguments}
      status={status}
      result={result}
    />
  );
}
