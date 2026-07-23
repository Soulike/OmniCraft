import {describe, expect, it} from 'vitest';

import {toOpenAIToolResultOutput, toReasoning} from './helpers.js';

describe('toReasoning', () => {
  it('returns undefined for none', () => {
    expect(toReasoning('none')).toBeUndefined();
  });

  it('maps minimal and shared levels 1:1', () => {
    expect(toReasoning('minimal')).toEqual({
      effort: 'minimal',
      summary: 'auto',
    });
    expect(toReasoning('low')).toEqual({effort: 'low', summary: 'auto'});
    expect(toReasoning('medium')).toEqual({effort: 'medium', summary: 'auto'});
    expect(toReasoning('high')).toEqual({effort: 'high', summary: 'auto'});
    expect(toReasoning('xhigh')).toEqual({effort: 'xhigh', summary: 'auto'});
  });

  it('clamps max to xhigh', () => {
    expect(toReasoning('max')).toEqual({effort: 'xhigh', summary: 'auto'});
  });
});

describe('toOpenAIToolResultOutput', () => {
  it('returns a plain string when all blocks are text', () => {
    expect(
      toOpenAIToolResultOutput([
        {type: 'text', text: 'a'},
        {type: 'text', text: 'b'},
      ]),
    ).toBe('a\nb');
  });

  it('returns a content-item array when media is present', () => {
    expect(
      toOpenAIToolResultOutput([
        {type: 'text', text: 'see:'},
        {type: 'image', mediaType: 'image/png', data: 'AAAA'},
        {
          type: 'document',
          mediaType: 'application/pdf',
          data: 'BBBB',
          name: 'r.pdf',
        },
      ]),
    ).toEqual([
      {type: 'input_text', text: 'see:'},
      {
        type: 'input_image',
        detail: 'auto',
        image_url: 'data:image/png;base64,AAAA',
      },
      {
        type: 'input_file',
        file_data: 'data:application/pdf;base64,BBBB',
        filename: 'r.pdf',
      },
    ]);
  });

  it('defaults the filename for a document without a name', () => {
    expect(
      toOpenAIToolResultOutput([
        {type: 'document', mediaType: 'application/pdf', data: 'BBBB'},
      ]),
    ).toEqual([
      {
        type: 'input_file',
        filename: 'document.pdf',
        file_data: 'data:application/pdf;base64,BBBB',
      },
    ]);
  });
});
