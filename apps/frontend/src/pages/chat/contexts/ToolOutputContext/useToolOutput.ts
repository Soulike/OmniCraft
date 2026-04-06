import {use} from 'react';

import {ToolOutputContext} from './ToolOutputContext.js';

/** Returns the streaming output for a specific tool call, or undefined if none. */
export function useToolOutput(callId: string): string | undefined {
  const {toolOutput} = use(ToolOutputContext);
  return toolOutput.get(callId);
}
