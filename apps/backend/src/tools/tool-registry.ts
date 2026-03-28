import type {ToolDefinition} from './types.js';

/**
 * Abstract base class for tool registries.
 * Concrete subclasses are singletons that group tools by category.
 */
export abstract class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Registers a tool. Throws if a different tool with the same name exists. */
  register(tool: ToolDefinition): void {
    const existing = this.tools.get(tool.name);
    if (existing) {
      if (existing === tool) return;
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Retrieves a tool by name, or undefined if not found. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Returns all registered tools. */
  getAll(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
