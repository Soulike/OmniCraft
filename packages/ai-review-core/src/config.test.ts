import {describe, expect, it} from 'vitest';

import {REASONING_EFFORTS, validateReviewConfig} from './config.js';

function validRaw() {
  return {
    generalModels: 'gpt-5.5, claude-opus-4.8',
    securityModels: 'gpt-5.5, claude-opus-4.8',
    confirmModel: 'claude-opus-4.8',
    generalEffort: 'xhigh',
    securityEffort: 'high',
    confirmEffort: 'max',
  };
}

describe('validateReviewConfig', () => {
  it('parses a valid config into the nested shape', () => {
    expect(validateReviewConfig(validRaw())).toEqual({
      general: {models: ['gpt-5.5', 'claude-opus-4.8'], effort: 'xhigh'},
      security: {models: ['gpt-5.5', 'claude-opus-4.8'], effort: 'high'},
      confirm: {model: 'claude-opus-4.8', effort: 'max'},
    });
  });

  it('accepts a single-model list per stage', () => {
    const result = validateReviewConfig({
      ...validRaw(),
      generalModels: 'gpt-5.5',
    });
    expect(result.general.models).toEqual(['gpt-5.5']);
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

  it('throws when GENERAL_MODELS is empty', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), generalModels: '   '}),
    ).toThrow(/GENERAL_MODELS/);
  });

  it('throws when SECURITY_MODELS is empty', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), securityModels: '   '}),
    ).toThrow(/SECURITY_MODELS/);
  });

  it('throws when GENERAL_MODELS has duplicates', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), generalModels: 'gpt-5.5, gpt-5.5'}),
    ).toThrow(/duplicate/i);
  });

  it('throws when SECURITY_MODELS has duplicates', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), securityModels: 'gpt-5.5, gpt-5.5'}),
    ).toThrow(/SECURITY_MODELS/);
  });

  it('throws when CONFIRM_MODEL is blank', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), confirmModel: '  '}),
    ).toThrow(/CONFIRM_MODEL/);
  });

  it('throws when GENERAL_EFFORT is not an accepted level', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), generalEffort: 'turbo'}),
    ).toThrow(/GENERAL_EFFORT/);
  });

  it('throws when SECURITY_EFFORT is not an accepted level', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), securityEffort: 'turbo'}),
    ).toThrow(/SECURITY_EFFORT/);
  });

  it('throws when CONFIRM_EFFORT is not an accepted level', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), confirmEffort: 'turbo'}),
    ).toThrow(/CONFIRM_EFFORT/);
  });
});
