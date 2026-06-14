import {describe, expect, it} from 'vitest';

import {preambleInstructions} from './preamble.js';

describe('preambleInstructions', () => {
  it('instructs stating intent before taking any action', () => {
    expect(preambleInstructions).toContain('Before taking any action');
  });

  it('clarifies action is not limited to tool calls', () => {
    expect(preambleInstructions).toContain('not limited to tool calls');
  });
});
