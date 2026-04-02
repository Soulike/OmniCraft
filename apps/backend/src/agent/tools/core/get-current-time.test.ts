import {describe, expect, it} from 'vitest';

import type {ToolExecutionContext} from '@/agent-core/tool/index.js';

import {getCurrentTimeTool} from './get-current-time.js';

const context: ToolExecutionContext = {
  availableSkills: new Map(),
  availableToolSets: new Map(),
  loadedToolSets: new Set(),
  loadToolSetToAgent: () => {
    // noop
  },
};

describe('getCurrentTimeTool', () => {
  it('has the correct name and description', () => {
    expect(getCurrentTimeTool.name).toBe('get_current_time');
    expect(getCurrentTimeTool.description).toBeTruthy();
  });

  it('returns a valid ISO 8601 date string', async () => {
    const result = await getCurrentTimeTool.execute({}, context);

    expect(new Date(result).toISOString()).toBe(result);
  });

  it('returns approximately the current time', async () => {
    const before = Date.now();
    const result = await getCurrentTimeTool.execute({}, context);
    const after = Date.now();

    const resultTime = new Date(result).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
  });
});
