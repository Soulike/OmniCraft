import {describe, expect, it} from 'vitest';

import {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_BYTES,
} from '@/agent-core/agent/index.js';

import {COMPACTION_TRIGGER_ATTACHMENT_BYTES} from './compaction-constants.js';

// The invariant covered below is load-bearing, not tuning:
//
// - Strictly below the trigger: `LlmSession.sendMessages` appends the new
//   message to history *before* `compactBeforeModelCall` runs. If one legal
//   message could reach the trigger on its own, compaction would fire on the
//   very turn the attachment arrived (the model would see a summary instead
//   of the attachment) and that same message would still exceed the trigger
//   afterwards, re-firing compaction every following turn.
// - At or above the largest per-file cap: otherwise a single legal
//   attachment at `MAX_IMAGE_ATTACHMENT_BYTES` or `MAX_DOCUMENT_ATTACHMENT_BYTES`,
//   whichever is larger, could never be sent.
//
// A future edit to either constant must preserve both bounds. This test — not
// a module-load assert — is what catches a violation: the invariant can only
// be broken by a source edit, which goes through CI, so a red test here beats
// a boot-time crash in production.
describe('attachment byte constant invariants', () => {
  it('keeps MAX_MESSAGE_ATTACHMENT_BYTES strictly below COMPACTION_TRIGGER_ATTACHMENT_BYTES', () => {
    expect(MAX_MESSAGE_ATTACHMENT_BYTES).toBeLessThan(
      COMPACTION_TRIGGER_ATTACHMENT_BYTES,
    );
  });

  it('keeps MAX_MESSAGE_ATTACHMENT_BYTES at or above the largest per-file cap', () => {
    expect(MAX_MESSAGE_ATTACHMENT_BYTES).toBeGreaterThanOrEqual(
      Math.max(MAX_IMAGE_ATTACHMENT_BYTES, MAX_DOCUMENT_ATTACHMENT_BYTES),
    );
  });
});
