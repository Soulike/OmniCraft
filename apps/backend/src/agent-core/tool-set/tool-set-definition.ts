import type {ToolDefinition} from '../tool/types.js';

/**
 * Abstract base class for tool set definitions.
 *
 * Each subclass represents a named group of related tools that can be
 * loaded on demand by the LLM via the `load_toolset` tool.
 * Subclasses register their tools in the constructor.
 */
export abstract class ToolSetDefinition {
  readonly name: string;
  readonly description: string;
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(metadata: {name: string; description: string}) {
    this.name = metadata.name;
    this.description = metadata.description;
  }

  /** Registers a tool into this set. Throws if a different tool with the same name exists. */
  protected register(tool: ToolDefinition): void {
    const existing = this.tools.get(tool.name);
    if (existing) {
      if (existing === tool) return;
      throw new Error(
        `Tool "${tool.name}" is already registered in tool set "${this.name}"`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /** Returns all tools in this set. */
  getAll(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
