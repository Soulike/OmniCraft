import {createContext} from 'react';

export interface ToolOutputContextValue {
  toolOutput: ReadonlyMap<string, string>;
  clearToolOutput: () => void;
}

export const ToolOutputContext = createContext<ToolOutputContextValue>({
  toolOutput: new Map(),
  clearToolOutput: () => {
    // Default no-op, overridden by ToolOutputProvider
  },
});
