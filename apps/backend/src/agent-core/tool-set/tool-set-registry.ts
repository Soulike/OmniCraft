import assert from 'node:assert';

import type {ToolSetDefinition} from './tool-set-definition.js';

/**
 * Abstract base class for tool set registries.
 *
 * Concrete subclasses are singletons that group tool sets by category.
 * Singleton lifecycle is managed by the base class via `create()`,
 * `getInstance()`, and `resetInstance()`.
 */
export abstract class ToolSetRegistry {
  private static readonly instances = new Map<
    typeof ToolSetRegistry,
    ToolSetRegistry
  >();

  private readonly toolSets = new Map<string, ToolSetDefinition>();

  /** Creates the singleton instance for the calling subclass. */
  static create(): ToolSetRegistry {
    assert(
      !ToolSetRegistry.instances.has(this),
      `${this.name} is already initialized.`,
    );
    const instance = Reflect.construct(this, []) as ToolSetRegistry;
    ToolSetRegistry.instances.set(this, instance);
    return instance;
  }

  /** Returns the singleton instance for the calling subclass. */
  static getInstance(): ToolSetRegistry {
    const instance = ToolSetRegistry.instances.get(this);
    assert(
      instance,
      `${this.name} is not initialized. Call ${this.name}.create() first.`,
    );
    return instance;
  }

  /** Resets the singleton instance for the calling subclass. Only for use in tests. */
  static resetInstance(): void {
    ToolSetRegistry.instances.delete(this);
  }

  /** Registers a tool set. Throws if a different tool set with the same name exists. */
  protected register(toolSet: ToolSetDefinition): void {
    const existing = this.toolSets.get(toolSet.name);
    if (existing) {
      if (existing === toolSet) return;
      throw new Error(`ToolSet "${toolSet.name}" is already registered`);
    }
    this.toolSets.set(toolSet.name, toolSet);
  }

  /** Retrieves a tool set by name, or undefined if not found. */
  get(name: string): ToolSetDefinition | undefined {
    return this.toolSets.get(name);
  }

  /** Returns all registered tool sets. */
  getAll(): ToolSetDefinition[] {
    return [...this.toolSets.values()];
  }
}
