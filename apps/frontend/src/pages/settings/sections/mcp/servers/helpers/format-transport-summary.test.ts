import {describe, expect, it} from 'vitest';

import {formatTransportSummary} from './format-transport-summary.js';

describe('formatTransportSummary', () => {
  it('formats a stdio transport with command and args', () => {
    expect(
      formatTransportSummary({
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server', '/path'],
        env: {},
      }),
    ).toBe('stdio · npx -y server /path');
  });

  it('formats a stdio transport with no args', () => {
    expect(
      formatTransportSummary({
        type: 'stdio',
        command: 'node ./s.js',
        args: [],
        env: {},
      }),
    ).toBe('stdio · node ./s.js');
  });

  it('formats an http transport', () => {
    expect(
      formatTransportSummary({
        type: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: {},
      }),
    ).toBe('http · https://mcp.example.com/mcp');
  });
});
