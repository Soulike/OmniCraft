import assert from 'node:assert';

import {describe, expect, it, vi} from 'vitest';

import {toolResultBlocksToText} from '@/agent-core/llm-api/tool-result-block.js';
import {createMockContext} from '@/agent-core/tool/testing.js';

vi.mock('@/models/settings-manager/index.js', () => ({
  SettingsManager: {
    getInstance: () => ({
      getAll: () => Promise.resolve({search: {tavilyApiKey: ''}}),
    }),
  },
}));

const {webSearchTool} = await import('./web-search.js');

describe('webSearchTool', () => {
  it('has the correct name', () => {
    expect(webSearchTool.name).toBe('web_search');
  });

  it('returns error when API key is not configured', async () => {
    const result = await webSearchTool.execute(
      {query: 'test query'},
      createMockContext(),
    );
    expect(toolResultBlocksToText(result.content)).toContain('Error:');
    expect(toolResultBlocksToText(result.content)).toContain(
      'Tavily API key is not configured',
    );
    expect(result.status).toBe('failure');
    assert(result.status === 'failure');
    expect(result.data.message).toBeTruthy();
  });
});
