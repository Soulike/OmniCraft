import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export function ToolExecutionCard({
  toolName,
  arguments: toolArguments,
  status,
  result,
}: ToolExecutionCardProps) {
  return (
    <ToolExecutionCardView
      toolName={toolName}
      arguments={toolArguments}
      status={status}
      result={result}
    />
  );
}
