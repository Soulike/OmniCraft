import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useSubmitActions} from './useSubmitActions.js';

describe('useSubmitActions', () => {
  it('calls onSubmit with collected answers on submit', () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const collectAnswers = () => [{question: 'q', answer: 'a'}];
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers, onSubmit}),
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {
      cancelled: false,
      answers: [{question: 'q', answer: 'a'}],
    });
  });

  it('calls onSubmit with cancelled on cancel', () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
    );

    act(() => {
      result.current.handleCancel();
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {cancelled: true});
  });

  it('sets submitting while the submission is in flight', () => {
    let resolve: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(result.current.submitting).toBe(true);

    act(() => {
      resolve?.();
    });
  });

  it('resets submitting when the submission fails so the user can retry', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('network')));
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
    );

    act(() => {
      result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(result.current.submitting).toBe(false);
    });

    // Retry is possible again: a second submit invokes the handler once more.
    act(() => {
      result.current.handleSubmit();
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('resets submitting when a cancel fails', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('network')));
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
    );

    act(() => {
      result.current.handleCancel();
    });

    await waitFor(() => {
      expect(result.current.submitting).toBe(false);
    });
  });

  it('reports canSubmit=false when no handler is provided', () => {
    const {result} = renderHook(() =>
      useSubmitActions({
        callId: 'c1',
        collectAnswers: () => [],
        onSubmit: null,
      }),
    );

    expect(result.current.canSubmit).toBe(false);
    act(() => {
      result.current.handleSubmit();
    });
    // no throw; nothing to assert beyond not crashing
  });
});
