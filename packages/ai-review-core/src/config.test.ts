import {describe, expect, it} from 'vitest';

import {REASONING_EFFORTS, validateReviewConfig} from './config.js';

describe('validateReviewConfig', () => {
  it('parses a valid config into a normalized shape', () => {
    const result = validateReviewConfig({
      reviewerModels: 'gpt-5.5, claude-opus-4.8',
      confirmModel: 'claude-opus-4.8',
      reasoningEffort: 'xhigh',
    });
    expect(result).toEqual({
      reviewerModels: ['gpt-5.5', 'claude-opus-4.8'],
      confirmModel: 'claude-opus-4.8',
      reasoningEffort: 'xhigh',
    });
  });

  it('exposes the accepted reasoning-effort levels', () => {
    expect(REASONING_EFFORTS).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('throws when REVIEWER_MODELS is empty', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: '   ',
        confirmModel: 'claude-opus-4.8',
        reasoningEffort: 'xhigh',
      }),
    ).toThrow(/REVIEWER_MODELS/);
  });

  it('throws when REVIEWER_MODELS lists only one model', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: 'gpt-5.5',
        confirmModel: 'claude-opus-4.8',
        reasoningEffort: 'xhigh',
      }),
    ).toThrow(/at least two/i);
  });

  it('throws when REVIEWER_MODELS has duplicates', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: 'gpt-5.5, gpt-5.5',
        confirmModel: 'claude-opus-4.8',
        reasoningEffort: 'xhigh',
      }),
    ).toThrow(/duplicate/i);
  });

  it('throws when CONFIRM_MODEL is blank', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: 'gpt-5.5, claude-opus-4.8',
        confirmModel: '  ',
        reasoningEffort: 'xhigh',
      }),
    ).toThrow(/CONFIRM_MODEL/);
  });

  it('throws when REASONING_EFFORT is not an accepted level', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: 'gpt-5.5, claude-opus-4.8',
        confirmModel: 'claude-opus-4.8',
        reasoningEffort: 'turbo',
      }),
    ).toThrow(/REASONING_EFFORT/);
  });
});
