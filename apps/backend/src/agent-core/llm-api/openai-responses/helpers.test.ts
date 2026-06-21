import {describe, expect, it} from 'vitest';

import {toReasoning} from './helpers.js';

describe('toReasoning', () => {
  it('returns undefined for none', () => {
    expect(toReasoning('none')).toBeUndefined();
  });

  it('maps minimal and shared levels 1:1', () => {
    expect(toReasoning('minimal')).toEqual({
      effort: 'minimal',
      summary: 'auto',
    });
    expect(toReasoning('low')).toEqual({effort: 'low', summary: 'auto'});
    expect(toReasoning('medium')).toEqual({effort: 'medium', summary: 'auto'});
    expect(toReasoning('high')).toEqual({effort: 'high', summary: 'auto'});
    expect(toReasoning('xhigh')).toEqual({effort: 'xhigh', summary: 'auto'});
  });

  it('clamps max to xhigh', () => {
    expect(toReasoning('max')).toEqual({effort: 'xhigh', summary: 'auto'});
  });
});
