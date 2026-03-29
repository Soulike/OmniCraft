import {SkillDefinition} from './skill-definition.js';

/**
 * Abstract base class for skill registries.
 * Concrete subclasses are singletons that group skills by category.
 * Skills are loaded from Markdown files via `loadFromFile`.
 */
export abstract class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  /**
   * Loads a single Markdown file, parses its frontmatter,
   * and registers the resulting SkillDefinition.
   */
  async loadFromFile(filePath: string): Promise<void> {
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
