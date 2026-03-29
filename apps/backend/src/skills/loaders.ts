import {readdir} from 'node:fs/promises';
import path from 'node:path';

import type {SkillRegistry} from './skill-registry.js';

/**
 * Scans a directory for `.md` files and loads each one into the registry.
 * Non-`.md` files are silently ignored. Does not recurse into subdirectories.
 */
export async function loadSkillsFromDirectory(
  registry: SkillRegistry,
  dirPath: string,
): Promise<void> {
  const entries = await readdir(dirPath, {withFileTypes: true});
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(dirPath, entry.name);
    await registry.loadFromFile(filePath);
  }
}
