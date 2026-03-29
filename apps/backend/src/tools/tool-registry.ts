import assert from 'node:assert';

import type {ToolDefinition} from './types.js';

/**
 * Abstract base class for tool registries.
 *
 * Concrete subclasses are singletons that group tools by category.
 * Singleton lifecycle is managed by the base class via `create()`,
 * `getInstance()`, and `resetInstance()`.
 */
export abstract class ToolRegistry {
  private static readonly instances = new Map<
    typeof ToolRegistry,
    ToolRegistry
  >();

  private readonly tools = new Map<string, ToolDefinition>();

  /** Creates the singleton instance for the calling subclass. */
  static create(): ToolRegistry {
    assert(
      !ToolRegistry.instances.has(this),
      `${this.name} is already initialized.`,
    );
    const instance = Reflect.construct(this, []) as ToolRegistry;
    ToolRegistry.instances.set(this, instance);
    return instance;
  }

  /** Returns the singleton instance for the calling subclass. */
  static getInstance(): ToolRegistry {
    const instance = ToolRegistry.instances.get(this);
    assert(
      instance,
      `${this.name} is not initialized. Call ${this.name}.create() first.`,
    );
    return instance;
  }

  /** Resets the singleton instance for the calling subclass. Only for use in tests. */
  static resetInstance(): void {
    ToolRegistry.instances.delete(this);
  }

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
