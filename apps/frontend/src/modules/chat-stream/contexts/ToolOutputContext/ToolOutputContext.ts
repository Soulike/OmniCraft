import {createContext} from 'react';

export interface ToolOutputContextValue {
  toolOutput: ReadonlyMap<string, string>;
}

export const ToolOutputContext = createContext<ToolOutputContextValue>({
  toolOutput: new Map(),
});
