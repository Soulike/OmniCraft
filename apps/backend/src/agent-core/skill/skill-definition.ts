import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';

import {parseFrontmatter} from '@omnicraft/markdown-frontmatter';

/** Metadata expected in a Skill file's YAML frontmatter. */
interface SkillFrontmatter {
  name: string;
  description: string;
}

/** Maximum allowed skill file size (1 MB). */
const MAX_SKILL_FILE_SIZE = 1024 * 1024;

/**
 * A skill definition loaded from a Markdown file.
 *
 * Holds only metadata (name, description) and the file path.
 * The full Markdown content is loaded lazily via `getContent()`.
 */
export class SkillDefinition {
  readonly name: string;
  readonly description: string;
  private readonly filePath: string;

  constructor(name: string, description: string, filePath: string) {
    this.name = name;
    this.description = description;
    this.filePath = filePath;
  }

  /**
   * Creates a SkillDefinition from a Markdown file path.
   * Validates the file before reading.
   * Reads only the frontmatter; the body is not retained.
   */
  static async fromFile(filePath: string): Promise<SkillDefinition> {
    await SkillDefinition.assertValidSkillFile(filePath);

    const raw = await readFile(filePath, 'utf-8');
    const {attributes} = parseFrontmatter<Partial<SkillFrontmatter>>(raw);

    if (!attributes.name || !attributes.description) {
      throw new Error(
        `Skill file "${filePath}" is missing required frontmatter fields: name, description`,
      );
    }

    return new SkillDefinition(
      attributes.name,
      attributes.description,
      filePath,
    );
  }

  /** Lazily reads the Markdown file and returns the body (excluding frontmatter). */
  async getContent(): Promise<string> {
    await SkillDefinition.assertValidSkillFile(this.filePath);

    const raw = await readFile(this.filePath, 'utf-8');
    const {body} = parseFrontmatter(raw);
    return body;
  }

  /** Validates that the file has a .md extension and does not exceed the size limit. */
  private static async assertValidSkillFile(filePath: string): Promise<void> {
    if (path.extname(filePath) !== '.md') {
      throw new Error(`Skill file "${filePath}" must be a Markdown (.md) file`);
    }

    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_SKILL_FILE_SIZE) {
      throw new Error(
        `Skill file "${filePath}" exceeds maximum size of ${MAX_SKILL_FILE_SIZE.toString()} bytes`,
      );
    }
  }
}
