import assert from 'node:assert';

import {SkillRegistry} from './skill-registry.js';

/** Registry for core skills. */
export class CoreSkillRegistry extends SkillRegistry {
  private static instance: CoreSkillRegistry | null = null;

  /** Returns the singleton instance. */
  static getInstance(): CoreSkillRegistry {
    assert(
      CoreSkillRegistry.instance !== null,
      'CoreSkillRegistry is not initialized. Call CoreSkillRegistry.create() first.',
    );
    return CoreSkillRegistry.instance;
  }

  /** Creates the singleton instance. */
  static create(): CoreSkillRegistry {
    assert(
      CoreSkillRegistry.instance === null,
      'CoreSkillRegistry is already initialized.',
    );
    const registry = new CoreSkillRegistry();
    CoreSkillRegistry.instance = registry;
    return registry;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    CoreSkillRegistry.instance = null;
  }
}
