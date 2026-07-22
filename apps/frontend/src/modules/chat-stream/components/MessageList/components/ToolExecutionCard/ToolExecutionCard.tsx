import type {AnyToolResultData} from '@omnicraft/tool-schemas';

import {ToolExecutionCardView} from '@/modules/tool-ui/index.js';

import {useToolOutput} from '../../../../contexts/ToolOutputContext/index.js';

interface ToolExecutionCardProps {
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'failure' | 'error';
  result?: string;
  data?: AnyToolResultData;
}

/**
 * Connector for a tool execution: the only SSE-coupled piece. It pulls the live
 * streaming output from the event bus (`useToolOutput`) and feeds the
 * agent-agnostic tool-ui view, which renders parameters/result from the
 * tool-schema shapes alone.
 */
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
