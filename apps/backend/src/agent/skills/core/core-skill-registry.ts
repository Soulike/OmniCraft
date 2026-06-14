import {SkillRegistry} from '@/agent-core/skill/index.js';

/** Registry for core skills. */
export class CoreSkillRegistry extends SkillRegistry {}

export const coreSkillRegistry = new CoreSkillRegistry();
