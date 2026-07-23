import {describe, expect, it} from 'vitest';

import {convertSnapshotJson} from './convert-tool-result-content.js';

describe('convertSnapshotJson', () => {
  it('wraps string tool-message content in a text block', () => {
    const {changed, value} = convertSnapshotJson({
      messages: [
        {role: 'user', content: 'hi'},
        {role: 'tool', callId: 'c1', status: 'success', content: 'done'},
      ],
    });
    expect(changed).toBe(true);
    expect((value as {messages: unknown[]}).messages[1]).toMatchObject({
      role: 'tool',
      content: [{type: 'text', text: 'done'}],
    });
  });

  it('is idempotent when content is already an array', () => {
    const input = {
      messages: [
        {
          role: 'tool',
          callId: 'c1',
          status: 'success',
          content: [{type: 'text', text: 'done'}],
        },
      ],
    };
    const {changed} = convertSnapshotJson(input);
    expect(changed).toBe(false);
  });

  it('leaves user/assistant messages untouched', () => {
    const {value} = convertSnapshotJson({
      messages: [
        {role: 'assistant', content: 'text', toolCalls: [], thinking: []},
      ],
    });
    expect((value as {messages: unknown[]}).messages[0]).toMatchObject({
      role: 'assistant',
      content: 'text',
    });
  });
});
