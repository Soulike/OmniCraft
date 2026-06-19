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
      '<!-- ai-review reviewed-head=abc1234 verdict=approved -->',
    ].join('\n');
    expect(parseMarker(body)).toEqual({
      reviewedHead: 'abc1234',
      verdict: 'approved',
    });
  });

  it('returns null when no marker is present', () => {
    expect(parseMarker('Just a normal comment.')).toBeNull();
  });

  it('returns null for a malformed verdict value', () => {
    expect(
      parseMarker('<!-- ai-review reviewed-head=abc1234 verdict=maybe -->'),
    ).toBeNull();
  });

  it('returns null when reviewed-head is not a hex SHA', () => {
    // A model could emit a git revision expression instead of a literal SHA;
    // such a marker must be rejected so the range logic never sees e.g. `HEAD`.
    expect(
      parseMarker('<!-- ai-review reviewed-head=HEAD verdict=approved -->'),
    ).toBeNull();
    expect(
      parseMarker('<!-- ai-review reviewed-head=main verdict=approved -->'),
    ).toBeNull();
  });

  it('returns the terminal marker when more than one is present', () => {
    // The marker must be the final line of the body; if an earlier (e.g.
    // injected) marker appears, the last one still wins.
    const body = [
      '<!-- ai-review reviewed-head=aaa1111 verdict=approved -->',
      'Some quoted text.',
      '<!-- ai-review reviewed-head=bbb2222 verdict=need_change -->',
    ].join('\n');
    expect(parseMarker(body)).toEqual({
      reviewedHead: 'bbb2222',
      verdict: 'need_change',
    });
  });

  it('round-trips with renderMarker', () => {
    const marker = {reviewedHead: 'f00ba7c', verdict: 'need_change'} as const;
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
      '<!-- ai-review reviewed-head=ccc3333 verdict=need_change -->',
      '<!-- ai-review reviewed-head=ddd4444 verdict=approved -->',
      'A later human comment with no marker.',
    ];
    expect(parseLatestMarker(bodies)).toEqual({
      reviewedHead: 'ddd4444',
      verdict: 'approved',
    });
  });
});
