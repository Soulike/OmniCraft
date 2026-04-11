import assert from 'node:assert';

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

    expect(result.status).toBe('success');
    assert(result.status === 'success');
    expect(new Date(result.content).toISOString()).toBe(result.content);
    expect(result.data.iso).toBe(result.content);
  });

  it('returns approximately the current time', async () => {
    const before = Date.now();
    const result = await getCurrentTimeTool.execute({}, createMockContext());
    const after = Date.now();

    const resultTime = new Date(result.content).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
    assert(result.status === 'success');
    expect(result.data.iso).toBe(result.content);
  });
});
