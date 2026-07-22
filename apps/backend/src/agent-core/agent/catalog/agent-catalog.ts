import os from 'node:os';

import type {SkillDefinition, SkillRegistry} from '../../skill/index.js';
import type {AnyToolDefinition} from '../../tool/index.js';
import type {ToolRegistry} from '../../tool/index.js';
import {loadSkillTool} from '../../tool/index.js';

function buildEnvironmentSection(
  workingDirectory: string,
  scratchDirectory: string,
): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const distinct = workingDirectory !== scratchDirectory;

  const lines = [
    '## Environment',
    '',
    `- OS: ${os.type()} ${os.release()} (${os.platform()}, ${os.arch()})`,
    `- Shell: ${process.env.SHELL ?? 'unknown'}`,
    `- Working directory: ${workingDirectory}`,
  ];
  if (distinct) {
    lines.push(`- Scratch space: ${scratchDirectory}`);
  }
  lines.push(
    `- Time zone: ${timeZone}`,
    '',
    'Relative paths in file operations are resolved from the working directory. Shell commands start in the working directory by default, though shell cwd can change between command calls when commands change directories.',
  );

  if (distinct) {
    lines.push(
      '',
      '## Working Directory vs Scratch Space',
      '',
      'You have access to two locations:',
      '',
      `- The working directory (${workingDirectory}) is where the task lives. Everything the user expects as an output of the task — code, docs, and any files that are part of the deliverable — belongs here. Relative paths resolve here.`,
      `- The scratch space (${scratchDirectory}) is a private area for this session. Use it for files that support your work but are not part of the task's output: temporary notes, plans, intermediate artifacts, downloaded references, and throwaway scripts. Address it by its absolute path. It persists for the life of the session and is discarded when the session is deleted.`,
      '',
      'Keep the two separate: do not leave scratch or intermediate files in the working directory, and do not place deliverables in the scratch space. When unsure whether a file is a deliverable, keep it in the scratch space and tell the user.',
    );
  } else {
    lines.push(
      '',
      '## Scratch Space',
      '',
      `This session has no project repository. Your working directory (${scratchDirectory}) is a private scratch space for this session: use it for any files you need to create while working — notes, drafts, downloaded references, and intermediate artifacts. It persists for the life of the session and is discarded when the session is deleted.`,
    );
  }

  return lines.join('\n');
}

export function buildAvailableSkills(
  skillRegistries: readonly SkillRegistry[],
): ReadonlyMap<string, SkillDefinition> {
  const skillMap = new Map<string, SkillDefinition>();

  for (const registry of skillRegistries) {
    for (const skill of registry.getAll()) {
      const existing = skillMap.get(skill.name);
      if (existing) {
        if (existing === skill) continue;
        throw new Error(
          `Duplicate skill name "${skill.name}" from different sources`,
        );
      }
      skillMap.set(skill.name, skill);
    }
  }

  return skillMap;
}

export function buildAvailableTools(
  toolRegistries: readonly ToolRegistry[],
  skillRegistries: readonly SkillRegistry[],
): ReadonlyMap<string, AnyToolDefinition> {
  const toolMap = new Map<string, AnyToolDefinition>();

  const addTool = (tool: AnyToolDefinition, source: string): void => {
    const existing = toolMap.get(tool.name);
    if (existing) {
      if (existing === tool) return;
      throw new Error(
        `Duplicate tool name "${tool.name}" from different sources (${source})`,
      );
    }
    toolMap.set(tool.name, tool);
  };

  for (const registry of toolRegistries) {
    for (const tool of registry.getAll()) {
      addTool(tool, 'tool registry');
    }
  }

  const skills = buildAvailableSkills(skillRegistries);
  if (skills.size > 0) {
    addTool(loadSkillTool, 'built-in');
  }

  return toolMap;
}

export function buildSystemPrompt(
  baseSystemPrompt: string,
  toolRegistries: readonly ToolRegistry[],
  skillRegistries: readonly SkillRegistry[],
  workingDirectory: string,
  scratchDirectory: string,
): string {
  let prompt = baseSystemPrompt;

  for (const registry of toolRegistries) {
    const section = registry.getSystemPromptSection();
    if (section) {
      prompt += '\n\n' + section;
    }
  }

  const skills = buildAvailableSkills(skillRegistries);
  if (skills.size > 0) {
    const skillLines = [...skills.values()]
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join('\n');

    prompt += [
      '',
      '## Available Skills',
      '',
      `Use the ${loadSkillTool.name} tool to load the full instructions for a skill before using it.`,
      '',
      skillLines,
    ].join('\n');
  }

  prompt += `\n\n${buildEnvironmentSection(workingDirectory, scratchDirectory)}`;

  return prompt;
}
