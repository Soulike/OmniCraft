const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;
const DEFAULT_MAIN_MODEL = 'claude-sonnet-4-20250514';

type Json = Record<string, unknown>;

/** Migrates one LLM block from the flat shape to the nested main/light shape. */
export function migrateLlmBlock(block: Json): Json {
  if (block.main !== undefined) {
    return block;
  }
  const {model, lightModel, thinkingLevel, ...connection} = block;
  const thinking = typeof thinkingLevel === 'string' ? thinkingLevel : 'none';
  return {
    ...connection,
    main: {
      model: typeof model === 'string' && model ? model : DEFAULT_MAIN_MODEL,
      thinkingLevel: thinking,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    },
    light: {
      model: typeof lightModel === 'string' ? lightModel : '',
      thinkingLevel: thinking,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    },
  };
}

/** Migrates the whole settings object (both llm and codingLlm blocks). */
export function migrateSettings(raw: Json): Json {
  const result: Json = {...raw};
  for (const key of ['llm', 'codingLlm']) {
    const block = result[key];
    if (block !== null && typeof block === 'object') {
      result[key] = migrateLlmBlock(block as Json);
    }
  }
  return result;
}
