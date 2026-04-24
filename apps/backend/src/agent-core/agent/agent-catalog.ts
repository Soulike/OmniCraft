import type {SkillDefinition, SkillRegistry} from '../skill/index.js';
import type {ToolDefinition} from '../tool/index.js';
import type {ToolRegistry} from '../tool/index.js';
import {loadSkillTool} from '../tool/index.js';

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
): ReadonlyMap<string, ToolDefinition> {
  const toolMap = new Map<string, ToolDefinition>();

  const addTool = (tool: ToolDefinition, source: string): void => {
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

  prompt +=
    `\n\nWorking directory: ${workingDirectory}. ` +
    'Relative paths in file operations are resolved from this directory; ' +
    'shell commands start here by default.';

  return prompt;
}
