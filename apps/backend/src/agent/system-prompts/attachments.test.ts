import {describe, expect, it} from 'vitest';

import {attachmentInstructions} from './attachments.js';

describe('attachmentInstructions', () => {
  it('states that attachment files are read-only', () => {
    expect(attachmentInstructions).toContain('read-only');
  });

  // The read-only bit is enforced by the file mode, and the agent runs as the
  // same user as this process — so it *can* chmod the bit back. Naming the
  // ways around it is the point: an instruction that only says "these are
  // read-only" leaves `chmod` looking like a reasonable response to EACCES.
  it.each(['chmod', 'overwrite', 'move', 'delete'])(
    'names %s as something not to do to an attachment',
    (verb) => {
      expect(attachmentInstructions).toContain(verb);
    },
  );

  it('gives the reason rather than only the prohibition', () => {
    expect(attachmentInstructions).toContain(
      'silently come to mean something different',
    );
  });

  it('points at a permitted alternative for a modified copy', () => {
    expect(attachmentInstructions).toContain('under a new name');
  });
});
