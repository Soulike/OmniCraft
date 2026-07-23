import {describe, expect, it} from 'vitest';

import {mcpServerStatusSchema} from './schema.js';

describe('mcpServerStatusSchema', () => {
  it('accepts the live connection statuses', () => {
    for (const status of ['connecting', 'connected', 'error'] as const) {
      const result = mcpServerStatusSchema.safeParse({
        name: 'fs',
        transportType: 'stdio',
        status,
        tools: [],
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects the removed 'disabled' status", () => {
    const result = mcpServerStatusSchema.safeParse({
      name: 'fs',
      transportType: 'stdio',
      status: 'disabled',
      tools: [],
    });
    expect(result.success).toBe(false);
  });
});
