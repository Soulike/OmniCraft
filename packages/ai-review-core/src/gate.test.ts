import {describe, expect, it} from 'vitest';

import {decideGate} from './gate.ts';

describe('decideGate', () => {
  it('approves and labels AI Approved when verdict is approved', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: 'approved',
      }),
    ).toEqual({exitCode: 0, label: 'AI Approved'});
  });

  it('blocks and labels AI Need Change when verdict is need_change', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: 'need_change',
      }),
    ).toEqual({exitCode: 1, label: 'AI Need Change'});
  });

  it('carries the prior verdict when there are no new commits', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: false,
        carriedVerdict: 'approved',
        postedVerdict: null,
      }),
    ).toEqual({exitCode: 0, label: 'AI Approved'});
  });

  it('fails (no label change) when an upstream job failed', () => {
    expect(
      decideGate({
        anyUpstreamFailed: true,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: 'approved',
      }),
    ).toEqual({exitCode: 1, label: null});
  });

  it('fails safe when there are changes but no posted verdict', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: null,
      }),
    ).toEqual({exitCode: 1, label: null});
  });

  it('fails safe when no new commits but the carried verdict is missing', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: false,
        carriedVerdict: null,
        postedVerdict: null,
      }),
    ).toEqual({exitCode: 1, label: null});
  });
});
