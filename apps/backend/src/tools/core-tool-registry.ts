import assert from 'node:assert';

import {ToolRegistry} from './tool-registry.js';

/** Registry for always-available core tools (e.g., load_skill). */
export class CoreToolRegistry extends ToolRegistry {
  private static instance: CoreToolRegistry | null = null;

  /** Returns the singleton instance. */
  static getInstance(): CoreToolRegistry {
    assert(
      CoreToolRegistry.instance !== null,
      'CoreToolRegistry is not initialized. Call CoreToolRegistry.create() first.',
    );
    return CoreToolRegistry.instance;
  }

  /** Creates the singleton instance. */
  static create(): CoreToolRegistry {
    assert(
      CoreToolRegistry.instance === null,
      'CoreToolRegistry is already initialized.',
    );
    const registry = new CoreToolRegistry();
    CoreToolRegistry.instance = registry;
    return registry;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    CoreToolRegistry.instance = null;
  }
}
