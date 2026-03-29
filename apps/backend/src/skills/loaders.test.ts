import {mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {loadSkillsFromDirectory} from './loaders.js';
import {SkillRegistry} from './skill-registry.js';

class TestSkillRegistry extends SkillRegistry {
  static createForTest(): TestSkillRegistry {
    return new TestSkillRegistry();
  }
}

describe('loadSkillsFromDirectory', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `skill-loaders-test-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('loads all .md files from a directory', async () => {
    await writeFile(
      path.join(tempDir, 'skill-a.md'),
      '---\nname: skill-a\ndescription: Skill A\n---\nBody A',
    );
    await writeFile(
      path.join(tempDir, 'skill-b.md'),
      '---\nname: skill-b\ndescription: Skill B\n---\nBody B',
    );
    await writeFile(path.join(tempDir, 'readme.txt'), 'Not a skill');

    const registry = TestSkillRegistry.createForTest();
    await loadSkillsFromDirectory(registry, tempDir);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.get('skill-a')).toBeDefined();
    expect(registry.get('skill-b')).toBeDefined();
  });

  it('handles empty directory', async () => {
    const registry = TestSkillRegistry.createForTest();
    await loadSkillsFromDirectory(registry, tempDir);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('ignores non-.md files', async () => {
    await writeFile(path.join(tempDir, 'notes.txt'), 'Not a skill');
    await writeFile(path.join(tempDir, 'data.json'), '{}');

    const registry = TestSkillRegistry.createForTest();
    await loadSkillsFromDirectory(registry, tempDir);
    expect(registry.getAll()).toHaveLength(0);
  });
});
