import {describe, expect, it} from 'vitest';

import {toolResultBlocksToText} from './tool-result-blocks-to-text.js';

describe('toolResultBlocksToText', () => {
  it('passes text through and renders media as placeholders', () => {
    const text = toolResultBlocksToText([
      {type: 'text', text: 'before'},
      {type: 'image', mediaType: 'image/png', data: 'AAAA'},
      {
        type: 'document',
        mediaType: 'application/pdf',
        data: 'AAAA',
        name: 'report.pdf',
      },
    ]);
    expect(text).toBe(
      'before\n[image: image/png]\n[document: report.pdf (application/pdf)]',
    );
  });

  it('falls back to "file" for a document without a name', () => {
    expect(
      toolResultBlocksToText([
        {type: 'document', mediaType: 'application/pdf', data: 'AAAA'},
      ]),
    ).toBe('[document: file (application/pdf)]');
  });
});
