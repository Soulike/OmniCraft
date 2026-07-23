import {mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {toolResultBlocksToText} from '@/agent-core/llm-api/helpers/tool-result-blocks-to-text.js';

import {SkillDefinition} from '../skill/skill-definition.js';
import {loadSkillTool} from './load-skill.js';
import {createMockContext} from './testing.js';

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
      createMockContext({
        availableSkills: new Map([[skill.name, skill]]),
      }),
    );

    expect(toolResultBlocksToText(result.content)).toContain('# Test Skill');
    expect(toolResultBlocksToText(result.content)).toContain('Do this.');
    expect(result.status).toBe('success');
  });

  it('returns error message when skill is not found', async () => {
    const result = await loadSkillTool.execute(
      {name: 'nonexistent'},
      createMockContext(),
    );

    expect(toolResultBlocksToText(result.content)).toContain('not found');
    expect(toolResultBlocksToText(result.content)).toContain('nonexistent');
    expect(result.status).toBe('failure');
  });
});
