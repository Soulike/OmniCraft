import {describe, expect, it} from 'vitest';

import {estimatePromptTokens} from './token-estimator.js';

describe('estimatePromptTokens', () => {
  it('returns at least one token for non-empty input', () => {
    expect(estimatePromptTokens({message: 'hello'})).toBeGreaterThanOrEqual(1);
  });

  it('grows with serialized input size', () => {
    const small = estimatePromptTokens({message: 'hello'});
    const large = estimatePromptTokens({message: 'hello'.repeat(200)});

    expect(large).toBeGreaterThan(small);
  });
});
