import {describe, expect, it} from 'vitest';

import {attachmentsToBlocks} from './attachments-to-blocks.js';

describe('attachmentsToBlocks', () => {
  it('maps an image attachment to an image block', () => {
    expect(
      attachmentsToBlocks([
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 3,
          data: 'AAA=',
          materializedByteSize: Buffer.from('AAA=', 'base64').byteLength,
        },
      ]),
    ).toEqual([{type: 'image', mediaType: 'image/png', data: 'AAA='}]);
  });

  it('maps a PDF to a document block carrying the file name', () => {
    expect(
      attachmentsToBlocks([
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          lastKnownByteSize: 3,
          data: 'BBB=',
          materializedByteSize: Buffer.from('BBB=', 'base64').byteLength,
        },
      ]),
    ).toEqual([
      {
        type: 'document',
        mediaType: 'application/pdf',
        data: 'BBB=',
        name: 'invoice.pdf',
      },
    ]);
  });

  it('maps a missing attachment to a text placeholder naming the file', () => {
    expect(
      attachmentsToBlocks([
        {
          fileName: 'gone.png',
          mediaType: 'image/png',
          lastKnownByteSize: 10,
          data: null,
          reason: 'missing',
        },
      ]),
    ).toEqual([{type: 'text', text: '[attachment missing: gone.png]'}]);
  });

  it('maps a too-large attachment to a text placeholder naming the file and its size, not the missing placeholder', () => {
    expect(
      attachmentsToBlocks([
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 12_910_182,
          data: null,
          reason: 'too-large',
        },
      ]),
    ).toEqual([
      {
        type: 'text',
        text: '[attachment too large to deliver: shot.png (12.3 MB)]',
      },
    ]);
  });

  it('preserves order across mixed attachments', () => {
    const blocks = attachmentsToBlocks([
      {
        fileName: 'a.png',
        mediaType: 'image/png',
        lastKnownByteSize: 1,
        data: 'AA==',
        materializedByteSize: Buffer.from('AA==', 'base64').byteLength,
      },
      {
        fileName: 'b.pdf',
        mediaType: 'application/pdf',
        lastKnownByteSize: 1,
        data: null,
        reason: 'missing',
      },
    ]);
    expect(blocks.map((block) => block.type)).toEqual(['image', 'text']);
  });
});
