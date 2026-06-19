import {describe, expect, it} from 'vitest';

import {renderKnownIssues} from './known-issues.js';

describe('renderKnownIssues', () => {
  it('returns an explicit empty marker when there are no issues', () => {
    expect(renderKnownIssues([])).toBe('(none)');
  });

  it('renders one line per issue as `path:line — first body line`', () => {
    const out = renderKnownIssues([
      {path: 'src/a.ts', line: 12, body: 'Off-by-one in the loop bound.'},
      {path: 'src/b.ts', line: 3, body: 'Unvalidated input reaches argv.'},
    ]);
    expect(out).toBe(
      '- src/a.ts:12 — Off-by-one in the loop bound.\n' +
        '- src/b.ts:3 — Unvalidated input reaches argv.',
    );
  });

  it('uses only the first non-empty line of a multi-line body', () => {
    const out = renderKnownIssues([
      {path: 'src/a.ts', line: 5, body: '\nTitle line\n\nmore detail here'},
    ]);
    expect(out).toBe('- src/a.ts:5 — Title line');
  });

  it('renders (no line) when line is null', () => {
    const out = renderKnownIssues([
      {path: 'src/a.ts', line: null, body: 'File-level concern.'},
    ]);
    expect(out).toBe('- src/a.ts:(no line) — File-level concern.');
  });
});
