import {describe, expect, it} from 'vitest';

import {migrateLlmBlock, migrateSettings} from './migrate-settings-lib.js';

describe('migrateLlmBlock', () => {
  it('moves flat model/thinkingLevel/lightModel into nested main/light', () => {
    const result = migrateLlmBlock({
      apiFormat: 'claude',
      apiKey: 'secret',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4.8',
      lightModel: 'claude-haiku-4.5',
      thinkingLevel: 'high',
    });
    expect(result).toEqual({
      apiFormat: 'claude',
      apiKey: 'secret',
      baseUrl: 'https://api.anthropic.com',
      main: {
        model: 'claude-opus-4.8',
        thinkingLevel: 'high',
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      },
      light: {
        model: 'claude-haiku-4.5',
        thinkingLevel: 'high',
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      },
    });
  });

  it('is idempotent when already migrated', () => {
    const already = {
      apiFormat: 'claude',
      main: {
        model: 'x',
        thinkingLevel: 'none',
        maxContextTokens: 1,
        maxOutputTokens: 1,
      },
      light: {
        model: '',
        thinkingLevel: 'none',
        maxContextTokens: 1,
        maxOutputTokens: 1,
      },
    };
    expect(migrateLlmBlock(already)).toBe(already);
  });

  it('migrates both llm and codingLlm in the whole settings object', () => {
    const migrated = migrateSettings({
      llm: {model: 'a', lightModel: '', thinkingLevel: 'none'},
      codingLlm: {model: 'b', lightModel: 'c', thinkingLevel: 'low'},
      agent: {maxToolRounds: 20},
    });
    expect((migrated.llm as {main: {model: string}}).main.model).toBe('a');
    expect((migrated.codingLlm as {light: {model: string}}).light.model).toBe(
      'c',
    );
    expect(migrated.agent).toEqual({maxToolRounds: 20});
  });
});
