import type {ToolSetDefinition} from './tool-set-definition.js';

/** Callback to load a ToolSetDefinition into the Agent's active tool set. */
export type LoadToolSetToAgentFn = (toolSet: ToolSetDefinition) => void;
