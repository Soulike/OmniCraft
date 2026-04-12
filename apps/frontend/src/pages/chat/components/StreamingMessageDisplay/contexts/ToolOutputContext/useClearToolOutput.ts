import {use} from 'react';

import {ToolOutputContext} from './ToolOutputContext.js';

/** Returns a function to clear all tool output state. */
export function useClearToolOutput(): () => void {
  const {clearToolOutput} = use(ToolOutputContext);
  return clearToolOutput;
}
