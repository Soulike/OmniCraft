import {describe, expect, it} from 'vitest';

import {
  formatBlockedFileAccessMessage,
  skippedByFileAccessPolicyMessage,
} from './file-access-policy-messages.js';

describe('file-access-policy-messages', () => {
  it('formats blocked direct-operation messages for the LLM', () => {
    expect(formatBlockedFileAccessMessage('/blocked')).toBe(
      'Error: Access denied by file access policy: /blocked. This operation would access a blocked sensitive path. Review the file access operation. If this operation is necessary, stop and ask the user to perform it manually.',
    );
  });

  it('exports the skipped-path policy note for broad searches', () => {
    expect(skippedByFileAccessPolicyMessage).toBe(
      'Some paths were skipped because they are blocked by file access policy. Do not try to bypass this policy. If accessing those paths is necessary, stop and ask the user to perform the operation manually.',
    );
  });
});
