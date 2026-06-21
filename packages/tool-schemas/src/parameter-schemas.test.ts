import {describe, expect, it} from 'vitest';

import type {AskUserBridgeResponse} from './parameter-schemas.js';
import {askUserBridgeResponseSchema} from './parameter-schemas.js';

describe('askUserBridgeResponseSchema', () => {
  it('accepts a non-cancelled response with answers', () => {
    const value: AskUserBridgeResponse = {
      cancelled: false,
      answers: [{question: 'q', answer: 'a'}],
    };
    expect(askUserBridgeResponseSchema.parse(value)).toEqual(value);
  });

  it('accepts a cancelled response', () => {
    const value: AskUserBridgeResponse = {cancelled: true};
    expect(askUserBridgeResponseSchema.parse(value)).toEqual(value);
  });
});
