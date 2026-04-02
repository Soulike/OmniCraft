import {describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';

import {getCurrentTimeTool} from './get-current-time.js';

describe('getCurrentTimeTool', () => {
  it('has the correct name and description', () => {
    expect(getCurrentTimeTool.name).toBe('get_current_time');
    expect(getCurrentTimeTool.description).toBeTruthy();
  });

  it('returns a valid ISO 8601 date string', async () => {
    const result = await getCurrentTimeTool.execute({}, createMockContext());

    expect(new Date(result).toISOString()).toBe(result);
  });

  it('returns approximately the current time', async () => {
    const before = Date.now();
    const result = await getCurrentTimeTool.execute({}, createMockContext());
    const after = Date.now();

    const resultTime = new Date(result).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
  });
});
