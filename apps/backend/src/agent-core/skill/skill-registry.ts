import assert from 'node:assert';

import {SkillDefinition} from './skill-definition.js';

/**
 * Abstract base class for skill registries.
 *
 * Concrete subclasses are singletons that group skills by category.
 * Singleton lifecycle is managed by the base class via `create()`,
 * `getInstance()`, and `resetInstance()`.
 * Skills are loaded from Markdown files via `loadFromFile`.
 */
export abstract class SkillRegistry {
  private static readonly instances = new Map<
    typeof SkillRegistry,
    SkillRegistry
  >();

  private readonly skills = new Map<string, SkillDefinition>();

  /** Creates the singleton instance for the calling subclass. */
  static create(): SkillRegistry {
    assert(
      !SkillRegistry.instances.has(this),
      `${this.name} is already initialized.`,
    );
    const instance = Reflect.construct(this, []) as SkillRegistry;
    SkillRegistry.instances.set(this, instance);
    return instance;
  }

  /** Returns the singleton instance for the calling subclass. */
  static getInstance(): SkillRegistry {
    const instance = SkillRegistry.instances.get(this);
    assert(
      instance,
      `${this.name} is not initialized. Call ${this.name}.create() first.`,
    );
    return instance;
  }

  /** Resets the singleton instance for the calling subclass. Only for use in tests. */
  static resetInstance(): void {
    SkillRegistry.instances.delete(this);
  }

  /**
   * Loads a single Markdown file, parses its frontmatter,
   * and registers the resulting SkillDefinition.
   */
  protected async loadFromFile(filePath: string): Promise<void> {
    const skill = await SkillDefinition.fromFile(filePath);
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill "${skill.name}" is already registered`);
    }
    this.skills.set(skill.name, skill);
  }

  /** Retrieves a skill by name, or undefined if not found. */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /** Returns all registered skills. */
  getAll(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  /** Returns name + description pairs for the system prompt skill catalog. */
  getSummaryList(): {name: string; description: string}[] {
    return this.getAll().map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }
}
