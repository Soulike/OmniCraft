import {describe, expect, it} from 'vitest';

import {CoreSkillRegistry, coreSkillRegistry} from './core-skill-registry.js';

describe('coreSkillRegistry', () => {
  it('exports the shared core skill registry instance', () => {
    expect(coreSkillRegistry).toBeInstanceOf(CoreSkillRegistry);
  });
});
