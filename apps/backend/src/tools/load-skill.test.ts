import {mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {SkillDefinition} from '@/skills/types.js';

import {loadSkillTool} from './load-skill.js';

describe('loadSkillTool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `load-skill-test-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('has the correct name and description', () => {
    expect(loadSkillTool.name).toBe('load_skill');
    expect(loadSkillTool.description).toBeTruthy();
  });

  it('returns skill content when skill is found', async () => {
    const filePath = path.join(tempDir, 'test-skill.md');
    await writeFile(
      filePath,
      '---\nname: test-skill\ndescription: A test\n---\n\n# Test Skill\n\nDo this.',
    );
    const skill = await SkillDefinition.fromFile(filePath);

    const result = await loadSkillTool.execute(
      {name: 'test-skill'},
      {availableSkills: [skill]},
    );

    expect(result).toContain('# Test Skill');
    expect(result).toContain('Do this.');
  });

  it('returns error message when skill is not found', async () => {
    const result = await loadSkillTool.execute(
      {name: 'nonexistent'},
      {availableSkills: []},
    );

    expect(result).toContain('not found');
    expect(result).toContain('nonexistent');
  });
});
