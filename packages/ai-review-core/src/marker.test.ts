import {describe, expect, it} from 'vitest';

import {parseLatestMarker, parseMarker, renderMarker} from './marker.js';

describe('renderMarker', () => {
  it('renders the exact marker comment', () => {
    expect(renderMarker({reviewedHead: 'abc123', verdict: 'approved'})).toBe(
      '<!-- ai-review reviewed-head=abc123 verdict=approved -->',
    );
  });

  it('renders need_change verdicts', () => {
    expect(
      renderMarker({reviewedHead: 'deadbeef', verdict: 'need_change'}),
    ).toBe('<!-- ai-review reviewed-head=deadbeef verdict=need_change -->');
  });
});

describe('parseMarker', () => {
  it('parses a marker embedded in a larger body', () => {
    const body = [
      '## AI Review',
      '',
      'Looks good.',
      '',
      '<!-- ai-review reviewed-head=abc123 verdict=approved -->',
    ].join('\n');
    expect(parseMarker(body)).toEqual({
      reviewedHead: 'abc123',
      verdict: 'approved',
    });
  });

  it('returns null when no marker is present', () => {
    expect(parseMarker('Just a normal comment.')).toBeNull();
  });

  it('returns null for a malformed verdict value', () => {
    expect(
      parseMarker('<!-- ai-review reviewed-head=abc verdict=maybe -->'),
    ).toBeNull();
  });

  it('round-trips with renderMarker', () => {
    const marker = {reviewedHead: 'f00ba7', verdict: 'need_change'} as const;
    expect(parseMarker(renderMarker(marker))).toEqual(marker);
  });
});

describe('parseLatestMarker', () => {
  it('returns null for an empty list', () => {
    expect(parseLatestMarker([])).toBeNull();
  });

  it('returns null when no body carries a marker', () => {
    expect(parseLatestMarker(['hello', 'world'])).toBeNull();
  });

  it('returns the marker from the most recent body that has one', () => {
    const bodies = [
      '<!-- ai-review reviewed-head=oldsha verdict=need_change -->',
      '<!-- ai-review reviewed-head=newsha verdict=approved -->',
      'A later human comment with no marker.',
    ];
    expect(parseLatestMarker(bodies)).toEqual({
      reviewedHead: 'newsha',
      verdict: 'approved',
    });
  });
});
