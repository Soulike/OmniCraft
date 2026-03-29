import assert from 'node:assert';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {SkillRegistry} from './skill-registry.js';

class TestSkillRegistry extends SkillRegistry {
  static createForTest(): TestSkillRegistry {
    return new TestSkillRegistry();
  }
}

describe('SkillRegistry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `skill-registry-test-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('loads a skill from a valid markdown file', async () => {
    const filePath = path.join(tempDir, 'test-skill.md');
    await writeFile(
      filePath,
      '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test\n\nBody content.',
    );

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(filePath);

    const skill = registry.get('test-skill');
    assert(skill);
    expect(skill.name).toBe('test-skill');
    expect(skill.description).toBe('A test skill');
  });

  it('returns undefined for unknown skill name', () => {
    const registry = TestSkillRegistry.createForTest();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('returns all registered skills', async () => {
    const file1 = path.join(tempDir, 'skill-a.md');
    const file2 = path.join(tempDir, 'skill-b.md');
    await writeFile(
      file1,
      '---\nname: skill-a\ndescription: Skill A\n---\nBody A',
    );
    await writeFile(
      file2,
      '---\nname: skill-b\ndescription: Skill B\n---\nBody B',
    );

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(file1);
    await registry.loadFromFile(file2);

    expect(registry.getAll()).toHaveLength(2);
  });

  it('returns summary list for system prompt', async () => {
    const filePath = path.join(tempDir, 'my-skill.md');
    await writeFile(
      filePath,
      '---\nname: my-skill\ndescription: Does something useful\n---\nContent.',
    );

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(filePath);

    expect(registry.getSummaryList()).toEqual([
      {name: 'my-skill', description: 'Does something useful'},
    ]);
  });

  it('throws when loading a file with missing frontmatter fields', async () => {
    const filePath = path.join(tempDir, 'bad-skill.md');
    await writeFile(filePath, '---\nname: only-name\n---\nContent.');

    const registry = TestSkillRegistry.createForTest();
    await expect(registry.loadFromFile(filePath)).rejects.toThrow(
      'missing required frontmatter fields',
    );
  });

  it('throws when loading duplicate skill name from different file', async () => {
    const file1 = path.join(tempDir, 'skill-1.md');
    const file2 = path.join(tempDir, 'skill-2.md');
    await writeFile(file1, '---\nname: dupe\ndescription: First\n---\nBody');
    await writeFile(file2, '---\nname: dupe\ndescription: Second\n---\nBody');

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(file1);
    await expect(registry.loadFromFile(file2)).rejects.toThrow(
      'Skill "dupe" is already registered',
    );
  });
});
