import {describe, expect, it} from 'vitest';

import {
  toInputItems,
  toOpenAIToolResultOutput,
  toReasoning,
} from './helpers.js';

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

describe('toInputItems user attachments', () => {
  const base = {id: 'u1', createdAt: 1, role: 'user' as const, content: 'look'};

  it('keeps bare string content when there are no attachments', () => {
    expect(toInputItems([{...base, attachments: []}])).toEqual([
      {type: 'message', role: 'user', content: 'look'},
    ]);
  });

  it('emits input_image before input_text', () => {
    expect(
      toInputItems([
        {
          ...base,
          attachments: [
            {
              fileName: 'shot.png',
              mediaType: 'image/png',
              byteSize: 3,
              data: 'AAA=',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_image',
            detail: 'auto',
            image_url: 'data:image/png;base64,AAA=',
          },
          {type: 'input_text', text: 'look'},
        ],
      },
    ]);
  });

  it('emits input_file with the file name for a PDF', () => {
    const items = toInputItems([
      {
        ...base,
        attachments: [
          {
            fileName: 'invoice.pdf',
            mediaType: 'application/pdf',
            byteSize: 3,
            data: 'BBB=',
          },
        ],
      },
    ]);

    expect(items[0]).toMatchObject({
      content: [
        {
          type: 'input_file',
          filename: 'invoice.pdf',
          file_data: 'data:application/pdf;base64,BBB=',
        },
        {type: 'input_text', text: 'look'},
      ],
    });
  });

  it('emits a text placeholder for a missing attachment', () => {
    const items = toInputItems([
      {
        ...base,
        attachments: [
          {
            fileName: 'gone.png',
            mediaType: 'image/png',
            byteSize: 3,
            data: null,
          },
        ],
      },
    ]);

    expect(items[0]).toMatchObject({
      content: [
        {type: 'input_text', text: '[attachment missing: gone.png]'},
        {type: 'input_text', text: 'look'},
      ],
    });
  });
});
