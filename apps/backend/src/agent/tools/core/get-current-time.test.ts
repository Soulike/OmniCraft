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
    const [block] = result.content;
    assert(block.type === 'text');
    expect(new Date(block.text).toISOString()).toBe(block.text);
    expect(result.data.iso).toBe(block.text);
  });

  it('returns approximately the current time', async () => {
    const before = Date.now();
    const result = await getCurrentTimeTool.execute({}, createMockContext());
    const after = Date.now();

    assert(result.status === 'success');
    const [block] = result.content;
    assert(block.type === 'text');
    const resultTime = new Date(block.text).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
    expect(result.data.iso).toBe(block.text);
  });
});
